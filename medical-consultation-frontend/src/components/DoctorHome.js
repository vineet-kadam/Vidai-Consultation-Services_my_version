// src/components/DoctorHome.js

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./VideoConsultation.css";

export default function DoctorHome() {
  const navigate = useNavigate();
  
  // ─── Refs ───────────────────────────────────────────────────────────────
  const localVideoRef    = useRef(null);
  const remoteVideoRef   = useRef(null);
  const peerRef          = useRef(null);
  const socketRef        = useRef(null);
  const mediaStreamRef   = useRef(null);
  const remoteStreamRef  = useRef(null);
  const recorderRef      = useRef(null);
  const audioChunksRef   = useRef([]);
  const allRecordingsRef = useRef([]); // Store all recordings with timestamps
  const iceQueueRef      = useRef([]);
  const callActiveRef    = useRef(false);
  const offerSentRef     = useRef(false);
  const currentSpeakerRef = useRef(null);
  const recordingStartTimeRef = useRef(null);

  // ─── MIME-type detection ────────────────────────────────────────────────
  const getSupportedMimeType = () => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
      "",
    ];
    return candidates.find((t) => t === "" || MediaRecorder.isTypeSupported(t));
  };

  // ─── Token ──────────────────────────────────────────────────────────────
  const token = localStorage.getItem("token");

  // ─── UI state ───────────────────────────────────────────────────────────
  const [micOn,           setMicOn]           = useState(true);
  const [camOn,           setCamOn]           = useState(true);
  const [notes,           setNotes]           = useState("");
  const [recording,       setRecording]       = useState(false);
  const [callStarted,     setCallStarted]     = useState(false);
  const [dictationActive, setDictationActive] = useState(false);
  const [isProcessing,    setIsProcessing]    = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState("");

  // ─── Data state ─────────────────────────────────────────────────────────
  const [clinics,         setClinics]         = useState([]);
  const [patients,        setPatients]        = useState([]);
  const [clinicId,        setClinicId]        = useState("");
  const [patientId,       setPatientId]       = useState("");
  const [consultationId,  setConsultationId]  = useState(null);
  const [appointmentId,   setAppointmentId]   = useState(null);
  const [roomId,          setRoomId]          = useState(null);
  const [patientUrl,      setPatientUrl]      = useState("");

  // ─── Auth guard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) window.location.href = "/";
  }, [token]);

  // ─── Fetch clinics on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetchClinics();
  }, []);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════════════
  const handleLogout = () => {
    // Clean up any active call
    cleanupCall();
    
    // Clear token
    localStorage.removeItem("token");
    
    // Redirect to login
    navigate("/");
  };

  // ═══════════════════════════════════════════════════════════════════════
  // CLINIC / PATIENT  helpers
  // ═══════════════════════════════════════════════════════════════════════
  const fetchClinics = async () => {
    try {
      const res  = await fetch("http://127.0.0.1:8000/api/clinics/");
      const data = await res.json();
      setClinics(data);
    } catch (err) {
      console.error("Failed to load clinics", err);
    }
  };

  const loadPatients = async (id) => {
    setClinicId(id);
    setPatientId("");
    setPatients([]);
    if (!id) return;
    try {
      const res  = await fetch(`http://127.0.0.1:8000/api/patients/${id}/`);
      const data = await res.json();
      if (res.ok) setPatients(data);
    } catch (err) {
      console.error("Failed to load patients", err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MIC / CAM  toggles
  // ═══════════════════════════════════════════════════════════════════════
  const toggleMic = () => {
    if (!mediaStreamRef.current) return;
    const newState = !micOn;
    mediaStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = newState;
    });
    setMicOn(newState);

    // Notify patient
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ 
        type: "doctor_mute_changed",
        muted: !newState
      }));
    }
  };

  const toggleCamera = () => {
    if (!mediaStreamRef.current) return;
    mediaStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
      setCamOn(t.enabled);
    });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // DICTATION CONTROL
  // ═══════════════════════════════════════════════════════════════════════
  const startDictation = () => {
    console.log("🎬 Starting dictation session");
    
    // Clear previous recordings
    allRecordingsRef.current = [];
    
    // Mute patient
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ 
        type: "mute_patient"
      }));
    }

    // Unmute doctor
    if (!micOn) {
      mediaStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      setMicOn(true);
    }

    // Start recording doctor
    setDictationActive(true);
    setTimeout(() => {
      startRecording(mediaStreamRef.current, "doctor");
    }, 100);
  };

  const stopDictation = async () => {
    console.log("⏹️ Stopping dictation session");
    
    // Stop current recording if any
    if (recording) {
      stopRecording();
    }

    setDictationActive(false);

    // Unmute patient
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ 
        type: "unmute_patient"
      }));
    }

    // Wait a bit for final recording to save
    await new Promise(resolve => setTimeout(resolve, 500));

    // Process all recordings
    await processAllRecordings();
  };

  const switchSpeaker = () => {
    if (!dictationActive) return;

    console.log("🔄 Switching speaker");

    // Stop current recording
    if (recording) {
      stopRecording();
    }

    // Wait for recording to stop, then start recording the other person
    setTimeout(() => {
      if (currentSpeakerRef.current === "doctor") {
        // Switch to patient
        console.log("👤 Switching to patient");
        
        // Mute doctor
        mediaStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
        setMicOn(false);

        // Unmute patient
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ 
            type: "unmute_patient"
          }));
        }

        // Start recording patient
        if (remoteStreamRef.current) {
          startRecording(remoteStreamRef.current, "patient");
        }

      } else {
        // Switch to doctor
        console.log("👨‍⚕️ Switching to doctor");
        
        // Unmute doctor
        mediaStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
        setMicOn(true);

        // Mute patient
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ 
            type: "mute_patient"
          }));
        }

        // Start recording doctor
        startRecording(mediaStreamRef.current, "doctor");
      }
    }, 200);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1 — create consultation
  // ═══════════════════════════════════════════════════════════════════════
  const startConsultation = async () => {
    if (!clinicId || !patientId)
      return alert("Select clinic and patient first");

    try {
      const res = await fetch("http://127.0.0.1:8000/api/start-consultation/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clinic: clinicId, patient: patientId }),
      });

      const data = await res.json();
      if (!res.ok) return alert("Failed: " + JSON.stringify(data));

      setAppointmentId(data.appointment_id);
      setConsultationId(data.consultation_id);
      setRoomId(data.room_id);
      setPatientUrl(data.patient_url);

      console.log("✅ Appointment ID set:", data.appointment_id);

      await startCall(data.room_id, data.appointment_id);
    } catch (err) {
      console.error(err);
      alert("Failed to start consultation: " + err.message);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2 — WebRTC + WebSocket setup
  // ═══════════════════════════════════════════════════════════════════════
  const sendOffer = useCallback(async () => {
    if (offerSentRef.current) {
      console.log("📤 Offer already sent");
      return;
    }
    offerSentRef.current = true;

    try {
      const offer = await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);
      console.log("📤 Sending offer");
      socketRef.current.send(JSON.stringify({ type: "offer", offer }));
    } catch (err) {
      console.error("❌ Error creating offer:", err);
    }
  }, []);

  const startCall = async (room, apptId) => {
    if (callActiveRef.current) {
      console.warn("⚠️ Call already active");
      return;
    }
    callActiveRef.current = true;
    offerSentRef.current  = false;

    try {
      console.log("🎬 Starting call — room:", room);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      mediaStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;
      console.log("📹 Local stream ready");

      peerRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      stream.getTracks().forEach((t) => peerRef.current.addTrack(t, stream));

      peerRef.current.ontrack = (e) => {
        console.log("📡 Doctor received remote track:", e.track.kind);

        const remoteVideo = remoteVideoRef.current;
        if (!remoteVideo) return;

        if (remoteVideo.srcObject !== e.streams[0]) {
          remoteVideo.srcObject = e.streams[0];
          remoteStreamRef.current = e.streams[0];
          console.log("✅ Patient stream saved");

          remoteVideo.onloadedmetadata = () => {
            remoteVideo.play().catch(err =>
              console.warn("Autoplay blocked", err)
            );
          };
        }
      };

      peerRef.current.onicecandidate = (e) => {
        if (
          e.candidate &&
          socketRef.current?.readyState === WebSocket.OPEN &&
          peerRef.current.remoteDescription
        ) {
          socketRef.current.send(
            JSON.stringify({ type: "ice", candidate: e.candidate })
          );
        }
      };

      peerRef.current.oniceconnectionstatechange = () =>
        console.log("🧊 ICE state:", peerRef.current.iceConnectionState);
      peerRef.current.onconnectionstatechange = () =>
        console.log("🔌 Connection state:", peerRef.current.connectionState);

      const ws = new WebSocket(`ws://127.0.0.1:8000/ws/call/${room}/`);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        ws.send(JSON.stringify({ type: "doctor_ready" }));
      };

      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data);
        console.log("📩 Doctor received:", msg.type);

        switch (msg.type) {
          case "ready":
            console.log("👤 Patient ready");
            await sendOffer();
            break;

          case "answer":
            console.log("✅ Received answer");
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer));

            for (const c of iceQueueRef.current) {
              await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
            }
            iceQueueRef.current = [];
            console.log("✅ Flushed ICE candidates");
            break;

          case "ice":
            if (!msg.candidate) break;
            if (peerRef.current.remoteDescription) {
              await peerRef.current.addIceCandidate(
                new RTCIceCandidate(msg.candidate)
              );
            } else {
              iceQueueRef.current.push(msg.candidate);
            }
            break;

          default:
            console.log("❓ Unknown message:", msg.type);
        }
      };

      ws.onerror  = (e) => console.error("❌ WebSocket error", e);
      ws.onclose  = ()  => console.log("🔌 WebSocket closed");

      setCallStarted(true);
      console.log("✅ Call setup complete");

    } catch (err) {
      console.error("❌ startCall failed:", err);
      callActiveRef.current = false;
      alert("Failed to start call: " + err.message);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RECORDING
  // ═══════════════════════════════════════════════════════════════════════
  const startRecording = (streamToRecord, speaker) => {
    if (!streamToRecord) {
      console.error(`❌ No ${speaker} stream`);
      return;
    }

    if (recorderRef.current?.state === "recording") {
      console.warn("⚠️ Already recording");
      return;
    }

    audioChunksRef.current = [];
    currentSpeakerRef.current = speaker;
    recordingStartTimeRef.current = Date.now();

    const mimeType = getSupportedMimeType();
    console.log(`🎙️ Recording ${speaker}`);

    const audioTracks = streamToRecord.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error(`❌ No ${speaker} audio track`);
      return;
    }

    const audioStream = new MediaStream(audioTracks);

    const wireCallbacks = (recorder) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          console.log(`📊 ${speaker} chunk: ${e.data.size} bytes`);
        }
      };
      
      recorder.onstop = () => {
        console.log(`📦 ${speaker} stopped - ${audioChunksRef.current.length} chunks`);
        if (audioChunksRef.current.length === 0) {
          console.warn(`⚠️ No ${speaker} data`);
          return;
        }
        
        const actualType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: actualType });
        console.log(`📦 ${speaker} blob: ${blob.size} bytes`);
        
        // Store recording with metadata
        allRecordingsRef.current.push({
          blob: blob,
          speaker: currentSpeakerRef.current,
          timestamp: recordingStartTimeRef.current,
          size: blob.size
        });

        console.log(`💾 Saved recording ${allRecordingsRef.current.length}: ${speaker}`);
        
        audioChunksRef.current = [];
      };

      recorder.onerror = (e) => {
        console.error(`❌ ${speaker} recorder error:`, e);
      };
    };

    try {
      recorderRef.current = new MediaRecorder(audioStream, { mimeType });
      wireCallbacks(recorderRef.current);
      recorderRef.current.start();
      setRecording(true);
      console.log(`🎙️ ${speaker} recording STARTED`);
    } catch (firstErr) {
      console.warn(`⚠️ Retry without mimeType:`, firstErr);
      try {
        recorderRef.current = new MediaRecorder(audioStream);
        wireCallbacks(recorderRef.current);
        recorderRef.current.start();
        setRecording(true);
      } catch (secondErr) {
        console.error(`❌ MediaRecorder failed:`, secondErr);
      }
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      console.log(`⏸️ Stopping ${currentSpeakerRef.current} recording`);
      recorderRef.current.stop();
      setRecording(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // BATCH PROCESSING
  // ═══════════════════════════════════════════════════════════════════════
  const processAllRecordings = async () => {
    const recordings = allRecordingsRef.current;
    
    if (recordings.length === 0) {
      console.log("⚠️ No recordings to process");
      return;
    }

    console.log(`🔄 Processing ${recordings.length} recordings...`);
    
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStatus("Starting transcription...");

    // Sort by timestamp
    recordings.sort((a, b) => a.timestamp - b.timestamp);

    let conversationText = "";

    for (let i = 0; i < recordings.length; i++) {
      const recording = recordings[i];
      const progress = ((i + 1) / recordings.length) * 100;
      
      setProcessingProgress(progress);
      setProcessingStatus(`Transcribing ${recording.speaker} (${i + 1}/${recordings.length})...`);

      console.log(`📤 Processing recording ${i + 1}/${recordings.length}: ${recording.speaker} (${recording.size} bytes)`);

      // Skip small recordings
      if (recording.size < 10000) {
        console.log(`⏩ Skipping ${recording.speaker} (too small)`);
        continue;
      }

      try {
        const text = await transcribeRecording(recording.blob, recording.speaker);
        
        if (text && text.trim()) {
          const label = recording.speaker.charAt(0).toUpperCase() + recording.speaker.slice(1);
          conversationText += `${label}: ${text}\n\n`;
          console.log(`✅ ${label}: ${text}`);
        }

        // Small delay between transcriptions
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        console.error(`❌ Failed to transcribe ${recording.speaker}:`, err);
      }
    }

    // Update notes with full conversation
    if (conversationText.trim()) {
      setNotes(prev => prev ? `${prev}\n\n${conversationText}` : conversationText);
      
      // Save to backend
      if (consultationId) {
        try {
          await fetch("http://127.0.0.1:8000/api/save-notes/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ 
              consultation: consultationId, 
              notes: notes ? `${notes}\n\n${conversationText}` : conversationText
            }),
          });
          console.log("✅ Notes saved to backend");
        } catch (err) {
          console.error("❌ Failed to save notes:", err);
        }
      }
    }

    setProcessingProgress(100);
    setProcessingStatus("Transcription complete!");

    // Clear after 2 seconds
    setTimeout(() => {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStatus("");
      allRecordingsRef.current = [];
    }, 2000);

    console.log("✅ All recordings processed");
  };

  const transcribeRecording = async (blob, speaker) => {
    if (!appointmentId) {
      console.error("❌ No appointmentId");
      return "";
    }

    const extMap = {
      "audio/webm":            ".webm",
      "audio/webm;codecs=opus":".webm",
      "audio/ogg":             ".ogg",
      "audio/ogg;codecs=opus": ".ogg",
      "audio/mp4":             ".mp4",
      "audio/mpeg":            ".mp3",
    };
    const ext = extMap[blob.type] || ".webm";
    const filename = `recording_${speaker}_${Date.now()}${ext}`;

    const fd = new FormData();
    fd.append("audio", blob, filename);
    fd.append("appointment_id", appointmentId);
    fd.append("speaker", speaker);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/speech-to-text/", {
        method: "POST",
        body: fd,
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        console.error(`❌ Backend error (${res.status}):`, data);
        return "";
      }
      
      return data.text || "";
    } catch (err) {
      console.error("❌ Transcription error:", err);
      return "";
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════
  const cleanupCall = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive")
      recorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    peerRef.current?.close();
    socketRef.current?.close();
    callActiveRef.current = false;
    offerSentRef.current  = false;
    iceQueueRef.current   = [];
    allRecordingsRef.current = [];
  };

  const endCall = async () => {
    cleanupCall();
    setCallStarted(false);
    setRecording(false);
    setDictationActive(false);

    if (consultationId) {
      try {
        await fetch("http://127.0.0.1:8000/api/end-consultation/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ consultation_id: consultationId }),
        });
      } catch (err) {
        console.error("end-consultation error", err);
      }
    }
    alert("Consultation ended");
    window.location.reload();
  };

  const saveNotes = async () => {
    if (!consultationId) return alert("No active consultation");
    try {
      await fetch("http://127.0.0.1:8000/api/save-notes/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ consultation: consultationId, notes }),
      });
      alert("Notes saved");
    } catch (err) {
      console.error("save-notes error", err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2>🩺 Doctor Console</h2>
        <button 
          className="btn secondary" 
          onClick={handleLogout}
          style={{ padding: "10px 20px" }}
        >
          🚪 Logout
        </button>
      </div>

      <div className="video-section">
        <video ref={localVideoRef}  autoPlay playsInline muted className="video-box" />
        <video ref={remoteVideoRef} autoPlay playsInline className="video-box" />
      </div>

      <div className="controls">
        <button className="btn secondary" onClick={toggleMic} disabled={dictationActive}>
          {micOn ? "🎤 Mute" : "🔇 Unmute"}
        </button>
        <button className="btn secondary" onClick={toggleCamera}>
          {camOn ? "📷 Camera Off" : "🚫 Camera On"}
        </button>
      </div>

      <div className="dropdowns">
        <select value={clinicId} onChange={(e) => loadPatients(e.target.value)}>
          <option value="">Select Clinic</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          disabled={!patients.length}
        >
          <option value="">Select Patient</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} ({p.patient_id})
            </option>
          ))}
        </select>

        <button
          className="btn primary"
          onClick={startConsultation}
          disabled={callStarted}
        >
          🟢 Start Consultation
        </button>
      </div>

      {patientUrl && (
        <div className="patient-url-box">
          <p><strong>Patient Join URL:</strong></p>
          <input type="text" value={patientUrl} readOnly />
        </div>
      )}

      {/* DICTATION CONTROLS */}
      <div className="dictation-controls" style={{ margin: "20px 0" }}>
        <h3>Dictation Controls</h3>
        
        {!dictationActive ? (
          <button
            className="btn primary"
            onClick={startDictation}
            disabled={!callStarted || isProcessing}
            style={{ fontSize: "18px", padding: "15px 30px" }}
          >
            🎙️ Start Dictation
          </button>
        ) : (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              className="btn secondary"
              onClick={switchSpeaker}
              style={{ fontSize: "16px", padding: "12px 24px" }}
            >
              🔄 Switch Speaker
            </button>
            <button
              className="btn warning"
              onClick={stopDictation}
              style={{ fontSize: "16px", padding: "12px 24px" }}
            >
              ⏹️ Stop Dictation
            </button>
          </div>
        )}

        {dictationActive && (
          <div style={{ marginTop: "10px", color: "#ef4444", fontWeight: "bold" }}>
            🔴 Recording: {currentSpeakerRef.current} 
            ({allRecordingsRef.current.length} segments saved)
          </div>
        )}
      </div>

      {/* PROCESSING INDICATOR */}
      {isProcessing && (
        <div style={{ 
          margin: "20px 0", 
          padding: "20px", 
          backgroundColor: "#1e293b",
          borderRadius: "8px",
          textAlign: "center"
        }}>
          <div style={{ 
            width: "80px", 
            height: "80px", 
            margin: "0 auto 15px",
            border: "8px solid #334155",
            borderTop: "8px solid #3b82f6",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }}></div>
          <div style={{ fontSize: "16px", color: "#94a3b8", marginBottom: "10px" }}>
            {processingStatus}
          </div>
          <div style={{ fontSize: "24px", color: "#3b82f6", fontWeight: "bold" }}>
            {Math.round(processingProgress)}%
          </div>
        </div>
      )}

      <div className="controls">
        <button className="btn danger" onClick={endCall} disabled={!callStarted}>
          🔴 End Call
        </button>
      </div>

      <div className="notes-section">
        <h3>Consultation Notes</h3>
        <textarea
          rows="10"
          placeholder="Notes will appear here after stopping dictation..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isProcessing}
        />
        <button className="btn success" onClick={saveNotes} disabled={isProcessing}>
          💾 Save Notes
        </button>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}