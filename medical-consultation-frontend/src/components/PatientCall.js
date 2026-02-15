// src/components/PatientCall.js
import React, { useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "./VideoConsultation.css";

const API = "http://localhost:8000";
const WS = "ws://localhost:8000";
export default function PatientCall() {
  const { roomId } = useParams();

  // ── Refs ──────────────────────────────────────────────────────────────────
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);
  const localStreamRef  = useRef(null);
  const peerRef         = useRef(null);
  const socketRef       = useRef(null);
  const iceQueueRef     = useRef([]);
  const answerSentRef   = useRef(false);

  // ── State ─────────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [micOn,     setMicOn]     = useState(true);
  const [camOn,     setCamOn]     = useState(true);

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    joinCall();
    return () => {
      peerRef.current?.close();
      socketRef.current?.close();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==========================================================================
  // JOIN CALL
  // ==========================================================================

  const joinCall = async () => {
    try {
      console.log("👤 Patient joining room:", roomId);

      const urlParams = new URLSearchParams(window.location.search);
      const apptId    = urlParams.get("appointment_id");
      if (!apptId) {
        alert("Invalid consultation link — missing appointment_id");
        return;
      }

      // 1. Local media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current          = stream;
      localVideoRef.current.srcObject = stream;
      console.log("📹 Patient local stream ready");

      // 2. Peer connection
      peerRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: "all",
      });

      stream.getTracks().forEach(t => peerRef.current.addTrack(t, stream));

      peerRef.current.ontrack = (e) => {
        const rv = remoteVideoRef.current;
        if (!rv || rv.srcObject === e.streams[0]) return;
        rv.srcObject        = e.streams[0];
        rv.onloadedmetadata = () => rv.play().catch(console.warn);
        console.log("📡 Patient got remote track:", e.track.kind);
      };

      peerRef.current.onicecandidate = (e) => {
        if (!e.candidate) return;
        if (peerRef.current.remoteDescription)
          socketRef.current?.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
        else
          iceQueueRef.current.push(e.candidate);
      };

      peerRef.current.oniceconnectionstatechange = () =>
        console.log("🧊 Patient ICE:", peerRef.current.iceConnectionState);
      peerRef.current.onconnectionstatechange = () =>
        console.log("🔌 Patient conn:", peerRef.current.connectionState);

      // 3. Signalling WebSocket
      if (!roomId) { alert("Invalid consultation link"); return; }

      const ws = new WebSocket(`${WS}/ws/call/${roomId}/`);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ type: "ready" }));
        console.log("✅ Patient WS open — sent ready");
      };

      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data);
        console.log("📩 Patient recv:", msg.type);

        switch (msg.type) {

          case "ready":
          case "doctor_ready":
            // Doctor initiates the offer — nothing to do here
            break;

          case "doctor_mute_changed":
            // Visual feedback only if desired
            console.log("👨‍⚕️ Doctor muted:", msg.muted);
            break;

          case "offer":
            if (answerSentRef.current) break;
            if (peerRef.current.signalingState !== "stable") break;
            answerSentRef.current = true;
            try {
              await peerRef.current.setRemoteDescription(new RTCSessionDescription(msg.offer));
              const answer = await peerRef.current.createAnswer();
              await peerRef.current.setLocalDescription(answer);
              ws.send(JSON.stringify({ type: "answer", answer }));
              for (const c of iceQueueRef.current)
                await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
              iceQueueRef.current = [];
              console.log("✅ Patient: answer sent, ICE flushed");
            } catch (err) {
              console.error("❌ Patient offer error:", err);
              answerSentRef.current = false;
            }
            break;

          case "ice":
            if (!msg.candidate) break;
            if (peerRef.current.remoteDescription)
              await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            else
              iceQueueRef.current.push(msg.candidate);
            break;

          default:
            console.log("❓ Patient unknown msg:", msg.type);
        }
      };

      ws.onerror = e => console.error("❌ Patient WS error", e);
      ws.onclose = () => { setConnected(false); console.log("🔌 Patient WS closed"); };

    } catch (err) {
      console.error("❌ Patient joinCall failed:", err);
      alert("Failed to join call: " + err.message);
    }
  };

  // ==========================================================================
  // MIC / CAM
  // ==========================================================================

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const next = !micOn;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => {
      t.enabled = !t.enabled;
      setCamOn(t.enabled);
    });
  };
  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="container">
      <h2>👤 Patient View</h2>
      <p style={{ color:"#94a3b8" }}>Room: {roomId}</p>

      {!connected
        ? <p style={{ color:"#fbbf24" }}>⏳ Connecting…</p>
        : <p style={{ color:"#4ade80" }}>✅ Connected</p>
      }

      <div className="video-section">
        <video ref={localVideoRef}  autoPlay playsInline  className="video-box" />
        <video ref={remoteVideoRef} autoPlay playsInline       className="video-box" />
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
