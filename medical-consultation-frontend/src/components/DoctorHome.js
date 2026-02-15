// src/components/DoctorHome.js
import React, { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./VideoConsultation.css";

const API = "http://localhost:8000";
const WS = "ws://localhost:8000";
// Must match consumers.py
const DOCTOR_PREFIX  = 0x01;
const PATIENT_PREFIX = 0x02;

export default function DoctorHome() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  // ── WebRTC refs ───────────────────────────────────────────────────────────
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);
  const peerRef         = useRef(null);
  const sigWsRef        = useRef(null);
  const mediaStreamRef  = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceQueueRef     = useRef([]);
  const callActiveRef   = useRef(false);
  const offerSentRef    = useRef(false);

  // ── STT refs ──────────────────────────────────────────────────────────────
  const sttWsRef       = useRef(null);
  const audioCtxRef    = useRef(null);
  const doctorProcRef  = useRef(null);
  const patientProcRef = useRef(null);
  const patientPollRef = useRef(null);

  // ── Sentence accumulator refs ─────────────────────────────────────────────
  // Deepgram emits multiple small FINAL results for one spoken sentence.
  // We hold them in a buffer per speaker and only commit to the textarea
  // after a 1.2 s pause — giving complete, unbroken lines.
  const doctorBufRef  = useRef("");
  const patientBufRef = useRef("");
  const doctorTimerRef  = useRef(null);
  const patientTimerRef = useRef(null);
  const COMMIT_DELAY  = 1200; // ms of silence before flushing a line

  // ── Notes / auto-save refs ────────────────────────────────────────────────
  const autoSaveTimerRef  = useRef(null);
  const latestNotesRef    = useRef("");
  const consultationIdRef = useRef(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [micOn,       setMicOn]       = useState(true);
  const [camOn,       setCamOn]       = useState(true);
  const [callStarted, setCallStarted] = useState(false);
  const [sttActive,   setSttActive]   = useState(false);
  const [sttStatus,   setSttStatus]   = useState("");
  const [notes,       setNotes]       = useState("");

  // ── Data state ────────────────────────────────────────────────────────────
  const [clinics,        setClinics]        = useState([]);
  const [patients,       setPatients]       = useState([]);
  const [clinicId,       setClinicId]       = useState("");
  const [patientId,      setPatientId]      = useState("");
  const [consultationId, setConsultationId] = useState(null);
  const [patientUrl,     setPatientUrl]     = useState("");

  useEffect(() => { latestNotesRef.current    = notes;          }, [notes]);
  useEffect(() => { consultationIdRef.current = consultationId; }, [consultationId]);
  useEffect(() => { if (!token) window.location.href = "/"; },    [token]);

  useEffect(() => {
    fetch(`${API}/api/clinics/`)
      .then(r => r.json()).then(setClinics).catch(console.error);
  }, []);

  useEffect(() => () => _cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  const loadPatients = async (id) => {
    setClinicId(id); setPatientId(""); setPatients([]);
    if (!id) return;
    try {
      const r = await fetch(`${API}/api/patients/${id}/`);
      const d = await r.json();
      if (r.ok) setPatients(d);
    } catch (e) { console.error(e); }
  };

  /** Float32Array → Int16 ArrayBuffer (PCM-16 LE) */
  const _toInt16 = (f32) => {
    const i16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      i16[i]  = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return i16.buffer;
  };

  /** RMS energy — used as silence gate */
  const _rms = (buf) => {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };

  /** Prepend 1-byte routing prefix to PCM buffer */
  const _prefixed = (pcmBuf, prefix) => {
    const out = new Uint8Array(1 + pcmBuf.byteLength);
    out[0] = prefix;
    out.set(new Uint8Array(pcmBuf), 1);
    return out.buffer;
  };

  // ==========================================================================
  // SENTENCE ACCUMULATOR
  // Deepgram fires multiple short FINAL results for a single spoken sentence
  // e.g. "Have you had" → FINAL, "any prior history" → FINAL, "of hypertension" → FINAL
  // We accumulate them per speaker and flush after COMMIT_DELAY ms of silence.
  // ==========================================================================

  const _flushSpeaker = useCallback((speaker) => {
    const isDoctor = speaker === "Doctor";
    const bufRef   = isDoctor ? doctorBufRef  : patientBufRef;
    const timerRef = isDoctor ? doctorTimerRef : patientTimerRef;

    const text = bufRef.current.trim();
    bufRef.current = "";
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!text) return;

    const line = `${speaker}: ${text}`;
    setNotes(prev => {
      const next = prev ? `${prev}\n${line}` : line;
      latestNotesRef.current = next;
      return next;
    });

    const consId = consultationIdRef.current;
    if (!consId) return;
    fetch(`${API}/api/append-transcript/`, {
      method : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body   : JSON.stringify({ consultation_id: consId, line }),
    }).catch(console.error);
  }, [token]);

  /**
   * Called on every Deepgram is_final result.
   * Appends text to the speaker's buffer and resets the flush timer.
   */
  const _accumulateFinal = useCallback((speaker, text) => {
    if (!text.trim()) return;
    const isDoctor = speaker === "Doctor";
    const bufRef   = isDoctor ? doctorBufRef   : patientBufRef;
    const timerRef = isDoctor ? doctorTimerRef  : patientTimerRef;

    // Append to buffer (space-separated)
    bufRef.current = bufRef.current ? `${bufRef.current} ${text}` : text;

    // Reset the commit timer
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => _flushSpeaker(speaker), COMMIT_DELAY);
  }, [_flushSpeaker]);

  // ==========================================================================
  // NOTES — persist to backend
  // ==========================================================================

  const _persistNotes = useCallback(async (consId) => {
    if (!consId) return;
    try {
      await fetch(`${API}/api/save-notes/`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body   : JSON.stringify({ consultation: consId, notes: latestNotesRef.current }),
      });
    } catch (e) { console.error("save-notes error:", e); }
  }, [token]);

  const _startAutoSave = useCallback((consId) => {
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setInterval(() => {
      if (latestNotesRef.current) _persistNotes(consId);
    }, 10_000);
  }, [_persistNotes]);

  // ==========================================================================
  // STT
  // ==========================================================================

  const startSTT = useCallback(() => {
    if (sttWsRef.current) return;
    setSttStatus("connecting");

    const ws = new WebSocket(`${WS}/ws/stt/`);
    ws.binaryType    = "arraybuffer";
    sttWsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ STT WS open");
      setSttActive(true);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);

        if (msg.type === "stt_ready") {
          console.log("🟢 Both Deepgram connections ready");
          setSttStatus("live");
          _startAudioCapture(ws);
          return;
        }

        if (msg.type === "stt_error") {
          console.error("❌ STT error:", msg.message);
          setSttStatus("error");
          return;
        }

        // Accumulate finals → flush after silence
        if (msg.type === "transcript" && msg.text && msg.is_final) {
          _accumulateFinal(msg.speaker, msg.text);
        }

      } catch (e) { console.error("STT parse error:", e); }
    };

    ws.onerror = () => setSttStatus("error");
    ws.onclose = () => {
      setSttActive(false);
      setSttStatus("");
      sttWsRef.current = null;
      _stopAudioCapture();
    };
  }, [_accumulateFinal]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopSTT = useCallback(() => {
    // Flush any buffered text immediately before stopping
    _flushSpeaker("Doctor");
    _flushSpeaker("Patient");
    if (sttWsRef.current) { sttWsRef.current.close(); sttWsRef.current = null; }
    _stopAudioCapture();
    setSttActive(false);
    setSttStatus("");
  }, [_flushSpeaker]);

  // ==========================================================================
  // AUDIO CAPTURE — two independent ScriptProcessorNodes, prefixed binary
  // ==========================================================================

  const _startAudioCapture = (ws) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx      = new AudioCtx({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      const CHUNK = 4096;
      const GATE  = 0.002;

      // ── Doctor ────────────────────────────────────────────────────────────
      if (mediaStreamRef.current) {
        const src  = ctx.createMediaStreamSource(mediaStreamRef.current);
        const proc = ctx.createScriptProcessor(CHUNK, 1, 1);
        doctorProcRef.current = proc;

        proc.onaudioprocess = (e) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const f32 = e.inputBuffer.getChannelData(0);
          if (_rms(f32) < GATE) return;
          ws.send(_prefixed(_toInt16(f32), DOCTOR_PREFIX));
        };

        src.connect(proc);
        proc.connect(ctx.destination);
        console.log("🎙️ Doctor capture started");
      }

      // ── Patient ───────────────────────────────────────────────────────────
      const attachPatient = (stream) => {
        if (!stream || patientProcRef.current) return;
        const src  = ctx.createMediaStreamSource(stream);
        const proc = ctx.createScriptProcessor(CHUNK, 1, 1);
        patientProcRef.current = proc;

        proc.onaudioprocess = (e) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const f32 = e.inputBuffer.getChannelData(0);
          if (_rms(f32) < GATE) return;
          ws.send(_prefixed(_toInt16(f32), PATIENT_PREFIX));
        };

        src.connect(proc);
        proc.connect(ctx.destination);
        console.log("🎙️ Patient capture started");
      };

      if (remoteStreamRef.current) {
        attachPatient(remoteStreamRef.current);
      } else {
        let tries = 0;
        patientPollRef.current = setInterval(() => {
          if (remoteStreamRef.current) {
            attachPatient(remoteStreamRef.current);
            clearInterval(patientPollRef.current);
            patientPollRef.current = null;
          } else if (++tries > 60) {
            clearInterval(patientPollRef.current);
            patientPollRef.current = null;
          }
        }, 500);
      }
    } catch (err) {
      console.error("❌ _startAudioCapture:", err);
    }
  };

  const _stopAudioCapture = () => {
    if (patientPollRef.current) { clearInterval(patientPollRef.current); patientPollRef.current = null; }
    try { doctorProcRef.current?.disconnect();  } catch (_) {}
    try { patientProcRef.current?.disconnect(); } catch (_) {}
    doctorProcRef.current  = null;
    patientProcRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  // ==========================================================================
  // WEBRTC
  // ==========================================================================

  const startConsultation = async () => {
    if (!clinicId || !patientId) return alert("Select clinic and patient first");
    try {
      const res  = await fetch(`${API}/api/start-consultation/`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body   : JSON.stringify({ clinic: clinicId, patient: patientId }),
      });
      const data = await res.json();
      if (!res.ok) return alert("Failed: " + JSON.stringify(data));

      setConsultationId(data.consultation_id);
      consultationIdRef.current = data.consultation_id;
      setPatientUrl(data.patient_url);
      await _startCall(data.room_id);
      _startAutoSave(data.consultation_id);
    } catch (err) {
      console.error(err);
      alert("Failed to start consultation: " + err.message);
    }
  };

  const _sendOffer = useCallback(async () => {
    if (offerSentRef.current) return;
    offerSentRef.current = true;
    try {
      const offer = await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);
      sigWsRef.current.send(JSON.stringify({ type: "offer", offer }));
    } catch (err) { console.error("❌ createOffer:", err); }
  }, []);

  const _startCall = async (room) => {
    if (callActiveRef.current) return;
    callActiveRef.current = true;
    offerSentRef.current  = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current          = stream;
      localVideoRef.current.srcObject = stream;

      peerRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        iceTransportPolicy: "all",
        iceCandidatePoolSize: 10,
      });
      stream.getTracks().forEach(t => peerRef.current.addTrack(t, stream));

      peerRef.current.ontrack = (e) => {
        const rv = remoteVideoRef.current;
        if (!rv || rv.srcObject === e.streams[0]) return;
        rv.srcObject            = e.streams[0];
        remoteStreamRef.current = e.streams[0];
        rv.onloadedmetadata     = () => rv.play().catch(console.warn);
        console.log("✅ Patient remote stream saved");
      };

      peerRef.current.onicecandidate = (e) => {
        if (e.candidate && sigWsRef.current?.readyState === WebSocket.OPEN
            && peerRef.current.remoteDescription)
          sigWsRef.current.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
      };

      const ws = new WebSocket(`${WS}/ws/call/${room}/`);
      sigWsRef.current = ws;
      ws.onopen    = () => ws.send(JSON.stringify({ type: "doctor_ready" }));
      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
          case "ready":
            await _sendOffer(); break;
          case "answer":
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer));
            for (const c of iceQueueRef.current)
              await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
            iceQueueRef.current = [];
            break;
          case "ice":
            if (!msg.candidate) break;
            if (peerRef.current.remoteDescription)
              await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            else
              iceQueueRef.current.push(msg.candidate);
            break;
          default: break;
        }
      };
      ws.onerror = e => console.error("❌ Signal WS error", e);
      ws.onclose = () => console.log("🔌 Signal WS closed");
      setCallStarted(true);
    } catch (err) {
      console.error("❌ _startCall:", err);
      callActiveRef.current = false;
      alert("Failed to start call: " + err.message);
    }
  };

  // ==========================================================================
  // CLEANUP / END CALL / NOTES
  // ==========================================================================

  const _cleanup = () => {
    // Flush any pending text
    _flushSpeaker("Doctor");
    _flushSpeaker("Patient");
    if (doctorTimerRef.current)  { clearTimeout(doctorTimerRef.current);  doctorTimerRef.current  = null; }
    if (patientTimerRef.current) { clearTimeout(patientTimerRef.current); patientTimerRef.current = null; }
    stopSTT();
    if (autoSaveTimerRef.current) { clearInterval(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    peerRef.current?.close();
    sigWsRef.current?.close();
    callActiveRef.current = false;
    offerSentRef.current  = false;
    iceQueueRef.current   = [];
  };

  const endCall = async () => {
    const consId = consultationIdRef.current;
    // Flush + save BEFORE teardown
    _flushSpeaker("Doctor");
    _flushSpeaker("Patient");
    await new Promise(r => setTimeout(r, 200)); // let flush timers fire
    await _persistNotes(consId);
    _cleanup();
    setCallStarted(false);
    if (consId) {
      try {
        await fetch(`${API}/api/end-consultation/`, {
          method : "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body   : JSON.stringify({ consultation_id: consId }),
        });
      } catch (e) { console.error(e); }
    }
    alert("Consultation ended. Notes saved ✅");
    window.location.reload();
  };

  const saveNotes = async () => {
    if (!consultationId) return alert("No active consultation");
    _flushSpeaker("Doctor");
    _flushSpeaker("Patient");
    await new Promise(r => setTimeout(r, 200));
    await _persistNotes(consultationId);
    alert("Notes saved ✅");
  };

  const handleLogout = () => { _cleanup(); localStorage.removeItem("token"); navigate("/"); };

  const toggleMic = () => {
    if (!mediaStreamRef.current) return;
    const next = !micOn;
    mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
    if (sigWsRef.current?.readyState === WebSocket.OPEN)
      sigWsRef.current.send(JSON.stringify({ type: "doctor_mute_changed", muted: !next }));
  };

  const toggleCamera = () => {
    if (!mediaStreamRef.current) return;
    mediaStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; setCamOn(t.enabled); });
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="container">

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
        <h2>🩺 Doctor Console</h2>
        <button className="btn secondary" onClick={handleLogout} style={{ padding:"10px 20px" }}>🚪 Logout</button>
      </div>

      <div className="video-section">
        <video ref={localVideoRef}  autoPlay playsInline  className="video-box" />
        <video ref={remoteVideoRef} autoPlay playsInline       className="video-box" />
      </div>

      <div className="controls">
        <button className="btn secondary" onClick={toggleMic}>{micOn ? "🎤 Mute" : "🔇 Unmute"}</button>
        <button className="btn secondary" onClick={toggleCamera}>{camOn ? "📷 Camera Off" : "🚫 Camera On"}</button>
      </div>

      <div className="dropdowns">
        <select value={clinicId} onChange={e => loadPatients(e.target.value)}>
          <option value="">Select Clinic</option>
          {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={patientId} onChange={e => setPatientId(e.target.value)} disabled={!patients.length}>
          <option value="">Select Patient</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.patient_id})</option>)}
        </select>
        <button className="btn primary" onClick={startConsultation} disabled={callStarted}>🟢 Start Consultation</button>
      </div>

      {patientUrl && (
        <div className="patient-url-box">
          <p><strong>Patient Join URL:</strong></p>
          <input type="text" value={patientUrl} readOnly />
        </div>
      )}

      <div className="dictation-controls" style={{ margin:"20px 0" }}>
        <h3>🎙️ Live Transcription (Deepgram)</h3>
        <div style={{ display:"flex", gap:"12px", flexWrap:"wrap", alignItems:"center" }}>
          {!sttActive ? (
            <button className="btn primary" onClick={startSTT} disabled={!callStarted}
              style={{ fontSize:"17px", padding:"13px 28px" }}>
              🎙️ Start Transcription
            </button>
          ) : (
            <button className="btn warning" onClick={stopSTT}
              style={{ fontSize:"17px", padding:"13px 28px" }}>
              ⏹️ Stop Transcription
            </button>
          )}
          {sttStatus === "connecting" && <span style={{ color:"#fbbf24", fontWeight:"bold" }}>⏳ Connecting…</span>}
          {sttStatus === "live"       && <span style={{ color:"#4ade80", fontWeight:"bold" }}>🟢 LIVE — Doctor &amp; Patient</span>}
          {sttStatus === "error"      && <span style={{ color:"#ef4444", fontWeight:"bold" }}>❌ STT error</span>}
        </div>
        {sttStatus === "live" && (
          <p style={{ color:"#94a3b8", fontSize:"13px", marginTop:"8px" }}>
            Each speaker has a dedicated stream. Full sentences appear after each pause. Auto-saved every 10 s.
          </p>
        )}
      </div>

      <div className="controls">
        <button className="btn danger" onClick={endCall} disabled={!callStarted}>🔴 End Call</button>
      </div>

      <div className="notes-section">
        <h3>
          Consultation Notes
          {consultationId && (
            <span style={{ fontSize:"12px", color:"#4ade80", marginLeft:"12px", fontWeight:"normal" }}>
              ✅ auto-saving every 10 s
            </span>
          )}
        </h3>
        <textarea
          rows="14"
          placeholder="Complete sentences appear here after each pause…"
          value={notes}
          onChange={e => { setNotes(e.target.value); latestNotesRef.current = e.target.value; }}
        />
        <button className="btn success" onClick={saveNotes}>💾 Save Notes</button>
      </div>

    </div>
  );
}
