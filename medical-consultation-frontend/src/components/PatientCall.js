// src/components/PatientCall.js

import React, { useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "./VideoConsultation.css";

export default function PatientCall() {
  const { roomId } = useParams();

  // ─── Refs ─────────────────────────────────────────────────────────────
  const localVideoRef     = useRef(null);
  const remoteVideoRef    = useRef(null);
  const localStreamRef    = useRef(null);
  const remoteStreamRef   = useRef(null);
  const peerRef           = useRef(null);
  const socketRef         = useRef(null);
  const iceQueueRef       = useRef([]);
  const answerSentRef     = useRef(false);
  const appointmentIdRef  = useRef(null);

  // ─── UI state ───────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [micOn,     setMicOn]     = useState(true);
  const [camOn,     setCamOn]     = useState(true);

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

  // ═══════════════════════════════════════════════════════════════════════
  // MOUNT  →  join call   |   UNMOUNT  →  cleanup
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    joinCall();

    return () => {
      if (peerRef.current)  peerRef.current.close();
      if (socketRef.current) socketRef.current.close();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // JOIN CALL
  // ═══════════════════════════════════════════════════════════════════════
  const joinCall = async () => {
    try {
      console.log("👤 Patient joining room:", roomId);

      // Get appointment ID from URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      const apptId = urlParams.get('appointment_id');
      
      if (!apptId) {
        alert("Invalid consultation link - missing appointment ID");
        console.error("❌ No appointment_id in URL");
        return;
      }
      
      appointmentIdRef.current = apptId;
      console.log("✅ Appointment ID from URL:", apptId);

      // 1. local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;
      console.log("📹 Patient local stream ready");

      // 2. peer connection
      peerRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      // add local tracks
      stream.getTracks().forEach((t) => peerRef.current.addTrack(t, stream));

      // remote track → remote <video> AND STORE REMOTE STREAM
      peerRef.current.ontrack = (e) => {
        console.log("📡 Patient received remote track:", e.track.kind);

        const remoteVideo = remoteVideoRef.current;
        if (!remoteVideo) return;

        if (remoteVideo.srcObject !== e.streams[0]) {
          remoteVideo.srcObject = e.streams[0];
          remoteStreamRef.current = e.streams[0];

          remoteVideo.onloadedmetadata = () => {
            remoteVideo.play().catch(err =>
              console.warn("Autoplay blocked (patient)", err)
            );
          };
        }
      };

      // ICE candidate → send over WebSocket
      peerRef.current.onicecandidate = (e) => {
        if (!e.candidate) return;
        if (peerRef.current.remoteDescription) {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
          }
        } else {
          iceQueueRef.current.push(e.candidate);
          console.log("⏳ Patient queued ICE candidate");
        }
      };

      // logging
      peerRef.current.oniceconnectionstatechange = () =>
        console.log("🧊 Patient ICE state:", peerRef.current.iceConnectionState);
      peerRef.current.onconnectionstatechange = () =>
        console.log("🔌 Patient connection state:", peerRef.current.connectionState);

      // 3. WebSocket
      if (!roomId) {
        alert("Invalid consultation link");
        return;
      }

      const ws = new WebSocket(
        `ws://127.0.0.1:8000/ws/call/${roomId}/`
      );

      socketRef.current = ws;

      ws.onopen = () => {
        console.log("✅ Patient WebSocket open — sending 'ready'");
        setConnected(true);
        ws.send(JSON.stringify({ type: "ready" }));
      };

      // handle incoming messages
      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data);
        console.log("📩 Patient received:", msg.type);

        switch (msg.type) {

          case "ready":
            console.log("📩 Patient ignoring 'ready' echo");
            break;

          case "doctor_ready":
            console.log("👨‍⚕️ Doctor is ready");
            break;

          // NEW: Handle mute commands from doctor
          case "mute_patient":
            console.log("🔇 Doctor requested patient mute");
            if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach((t) => {
                t.enabled = false;
              });
              setMicOn(false);
            }
            break;

          case "unmute_patient":
            console.log("🎤 Doctor requested patient unmute");
            if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach((t) => {
                t.enabled = true;
              });
              setMicOn(true);
            }
            break;

          case "doctor_mute_changed":
            // Optional: You can show visual feedback when doctor mutes/unmutes
            console.log("👨‍⚕️ Doctor mute changed:", msg.muted);
            break;

          case "offer":
            if (answerSentRef.current) {
              console.log("📩 Patient ignoring duplicate offer");
              break;
            }

            if (peerRef.current.signalingState !== "stable") {
              console.warn("⚠️ Ignoring offer — state:", peerRef.current.signalingState);
              break;
            }

            answerSentRef.current = true;

            try {
              await peerRef.current.setRemoteDescription(
                new RTCSessionDescription(msg.offer)
              );
              console.log("✅ Patient remote description set");

              const answer = await peerRef.current.createAnswer();
              await peerRef.current.setLocalDescription(answer);
              console.log("📤 Patient sending answer");
              ws.send(JSON.stringify({ type: "answer", answer }));

              // Flush queued ICE candidates
              for (const c of iceQueueRef.current) {
                await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
              }
              iceQueueRef.current = [];
              console.log("✅ Patient flushed ICE candidates");
            } catch (err) {
              console.error("❌ Patient error processing offer:", err);
              answerSentRef.current = false;
            }
            break;

          case "ice":
            if (!msg.candidate) break;
            if (peerRef.current.remoteDescription) {
              await peerRef.current.addIceCandidate(
                new RTCIceCandidate(msg.candidate)
              );
            } else {
              iceQueueRef.current.push(msg.candidate);
              console.log("⏳ Patient queued ICE candidate");
            }
            break;

          default:
            console.log("❓ Patient — unknown message type:", msg.type);
        }
      };

      ws.onerror = (e) => console.error("❌ Patient WebSocket error", e);
      ws.onclose = () => {
        console.log("🔌 Patient WebSocket closed");
        setConnected(false);
      };

    } catch (err) {
      console.error("❌ Patient joinCall failed:", err);
      alert("Failed to join call: " + err.message);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MIC / CAM  toggles
  // ═══════════════════════════════════════════════════════════════════════
  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const newState = !micOn;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = newState;
    });
    setMicOn(newState);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
      setCamOn(t.enabled);
    });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="container">
      <h2>👤 Patient View</h2>
      <p style={{ color: "#94a3b8" }}>Room: {roomId}</p>

      {!connected ? (
        <p style={{ color: "#fbbf24" }}>⏳ Connecting…</p>
      ) : (
        <p style={{ color: "#4ade80" }}>✅ Connected</p>
      )}

      {!micOn && (
        <p style={{ color: "#ef4444", fontWeight: "bold" }}>
          🔇 You are muted (Doctor is speaking)
        </p>
      )}

      <div className="video-section">
        <video ref={localVideoRef}  autoPlay playsInline muted className="video-box" />
        <video ref={remoteVideoRef} autoPlay playsInline className="video-box" />
      </div>

      <div className="controls">
        <button className="btn secondary" onClick={toggleMic}>
          {micOn ? "🎤 Mute" : "🔇 Unmute"}
        </button>
        <button className="btn secondary" onClick={toggleCamera}>
          {camOn ? "📷 Camera Off" : "🚫 Camera On"}
        </button>
      </div>
    </div>
  );
}