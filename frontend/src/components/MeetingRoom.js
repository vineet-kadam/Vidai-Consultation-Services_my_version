// src/components/MeetingRoom.js -- FIXED
// Bug fix: myRole now reads from URL ?role= param first (set by home pages),
// falling back to localStorage. This fixes the "doctor shown as sales" naming bug.

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import "./MeetingRoom.css";

const API              = "http://192.168.10.191:8000";
const WS               = "ws://192.168.10.191:8000";
const COMMIT_DELAY     = 1200;
const SELF_PREFIX      = 0x01;
const TRANSCRIPT_POLL_MS = 3000;

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

const roleIcon  = (role) => ({ doctor:"🩺", patient:"🙋", sales:"💼", admin:"🛡" }[role] || "👤");
const roleColor = (role) => ({ doctor:"#38bdf8", patient:"#4ade80", sales:"#f59e0b", admin:"#818cf8" }[role] || "#94a3b8");

const fmt12 = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", hour12: true });
};

// ---------------------------------------------------------------------------
// VideoTile — defined outside MeetingRoom so React never remounts it
// ---------------------------------------------------------------------------
function VideoTile({ stream, name, role, muted, label }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div className="mr-tile">
      <video ref={videoRef} autoPlay playsInline muted={!!muted} className="mr-tile-video" />
      <div className="mr-tile-label" style={{ borderLeft: `3px solid ${roleColor(role)}` }}>
        {roleIcon(role)} {name}{label ? ` (${label})` : ""}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MeetingRoom
// ---------------------------------------------------------------------------
export default function MeetingRoom() {
  const { roomId }     = useParams();
  const [searchParams] = useSearchParams();
  const meetingId      = searchParams.get("meeting_id");
  const token          = localStorage.getItem("token");

  // FIX: read role from URL param first — home pages now pass ?role=doctor/patient/sales
  // This prevents the bug where localStorage still had the previous user's role.
  const myRole = searchParams.get("role") || localStorage.getItem("role") || "participant";
  const myName = localStorage.getItem("full_name") || localStorage.getItem("username") || "Me";
  const navigate = useNavigate();

  const [localStream, setLocalStream] = useState(null);
  const localStreamRef = useRef(null);

  const peersRef  = useRef({});
  const [remotes, setRemotes] = useState([]);

  const sigWsRef     = useRef(null);
  const myIdRef      = useRef(null);
  const isMountedRef = useRef(true);

  const sttWsRef    = useRef(null);
  const audioCtxRef = useRef(null);
  const procRef     = useRef(null);
  const bufRef      = useRef("");
  const timerRef    = useRef(null);
  const latestRef   = useRef("");
  const meetingIdRef = useRef(meetingId);

  const [micOn,        setMicOn]        = useState(true);
  const [camOn,        setCamOn]        = useState(true);
  const [connected,    setConnected]    = useState(false);
  const [sttStatus,    setSttStatus]    = useState("");
  const [transcript,   setTranscript]   = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput,    setChatInput]    = useState("");
  const [rightPanel,   setRightPanel]   = useState(null);
  const [duration,     setDuration]     = useState(0);
  const [error,        setError]        = useState("");
  const [participants, setParticipants] = useState([]);
  const [unreadChat,   setUnreadChat]   = useState(0);
  const [unreadTx,     setUnreadTx]     = useState(0);
  const [meetingEnded, setMeetingEnded] = useState(false);

  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [chatMessages]);
  useEffect(() => { if (rightPanel === "chat")       setUnreadChat(0); }, [rightPanel]);
  useEffect(() => { if (rightPanel === "transcript") setUnreadTx(0);   }, [rightPanel]);
  useEffect(() => { latestRef.current = transcript; }, [transcript]);

  // Shared transcript polling
  useEffect(() => {
    if (!meetingId || !token) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/meeting/${meetingId}/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.speech_to_text && data.speech_to_text !== latestRef.current) {
          setTranscript(data.speech_to_text);
          latestRef.current = data.speech_to_text;
        }
        if (data.status === "ended") setMeetingEnded(true);
      } catch (_) {}
    };
    poll();
    const interval = setInterval(poll, TRANSCRIPT_POLL_MS);
    return () => clearInterval(interval);
  }, [meetingId, token]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!roomId) { setError("Room ID missing from URL."); return; }
    const t = setTimeout(() => { if (isMountedRef.current) _init(); }, 100);
    return () => { clearTimeout(t); isMountedRef.current = false; _cleanup(); };
  }, []); // eslint-disable-line

  const _init = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      _openSignalling();
    } catch (err) {
      setError(`Camera/mic error: ${err.message}. Please allow camera and microphone access.`);
    }
  };

  const _openSignalling = () => {
    const ws = new WebSocket(`${WS}/ws/call/${roomId}/`);
    sigWsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setConnected(true);
      ws.send(JSON.stringify({ type: "join", name: myName, role: myRole }));
      _openSttWs();
    };

    ws.onmessage = async (evt) => {
      if (!isMountedRef.current) return;
      let msg; try { msg = JSON.parse(evt.data); } catch { return; }

      switch (msg.type) {
        case "assigned":
          myIdRef.current = msg.id;
          setParticipants(msg.peers || []);
          for (const peer of (msg.peers || [])) {
            await _createPeerConnection(peer.id, peer.name, peer.role, true);
          }
          break;
        case "peer_joined":
          setParticipants(prev => [...prev.filter(p => p.id !== msg.id), { id: msg.id, name: msg.name, role: msg.role }]);
          await _createPeerConnection(msg.id, msg.name, msg.role, false);
          break;
        case "peer_left":
          _removePeer(msg.id);
          setParticipants(prev => prev.filter(p => p.id !== msg.id));
          break;
        case "offer":  await _handleOffer(msg.from, msg.offer);   break;
        case "answer": await _handleAnswer(msg.from, msg.answer); break;
        case "ice":    await _handleIce(msg.from, msg.candidate); break;
        case "chat":
          setChatMessages(prev => [...prev, {
            id: Date.now(), from: msg.name, role: msg.role,
            text: msg.text, ts: msg.ts, self: false,
          }]);
          if (rightPanel !== "chat") setUnreadChat(n => n + 1);
          break;
        default: break;
      }
    };

    ws.onerror = () => { if (isMountedRef.current) setError("WebSocket error. Is Django running on port 8000?"); };
    ws.onclose = () => { if (isMountedRef.current) setConnected(false); };
  };

  const _createPeerConnection = async (peerId, peerName, peerRole, sendOffer) => {
    if (peersRef.current[peerId]) return;
    const pc = new RTCPeerConnection(ICE_CONFIG);
    peersRef.current[peerId] = { pc, name: peerName, role: peerRole, stream: null };

    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      peersRef.current[peerId].stream = stream;
      setRemotes(prev => {
        const existing = prev.find(r => r.id === peerId);
        if (existing) return prev.map(r => r.id === peerId ? { ...r, stream } : r);
        return [...prev, { id: peerId, name: peerName, role: peerRole, stream }];
      });
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && sigWsRef.current?.readyState === WebSocket.OPEN) {
        sigWsRef.current.send(JSON.stringify({ type: "ice", to: peerId, candidate: e.candidate }));
      }
    };

    if (sendOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sigWsRef.current?.send(JSON.stringify({ type: "offer", to: peerId, offer }));
    }
  };

  const _handleOffer = async (fromId, offer) => {
    if (!peersRef.current[fromId]) {
      const p = participants.find(p => p.id === fromId) || { name: "Participant", role: "participant" };
      await _createPeerConnection(fromId, p.name, p.role, false);
    }
    const { pc } = peersRef.current[fromId];
    if (pc.signalingState !== "stable") return;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sigWsRef.current?.send(JSON.stringify({ type: "answer", to: fromId, answer }));
  };

  const _handleAnswer = async (fromId, answer) => {
    const peer = peersRef.current[fromId];
    if (!peer) return;
    if (peer.pc.signalingState === "have-local-offer") {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const _handleIce = async (fromId, candidate) => {
    const peer = peersRef.current[fromId];
    if (!peer || !candidate) return;
    try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
  };

  const _removePeer = (peerId) => {
    const peer = peersRef.current[peerId];
    if (peer) { peer.pc.close(); delete peersRef.current[peerId]; }
    setRemotes(prev => prev.filter(r => r.id !== peerId));
  };

  // STT
  const _toInt16 = f32 => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    return out.buffer;
  };
  const _rms = buf => { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]*buf[i]; return Math.sqrt(s/buf.length); };
  const _prefixed = (pcm) => { const out = new Uint8Array(1 + pcm.byteLength); out[0] = SELF_PREFIX; out.set(new Uint8Array(pcm), 1); return out.buffer; };

  const _flushBuffer = useCallback(() => {
    const text = bufRef.current.trim();
    bufRef.current = "";
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!text) return;
    const speakerLabel = myRole.charAt(0).toUpperCase() + myRole.slice(1);
    const line = `${speakerLabel} (${myName}): ${text}`;
    setTranscript(prev => { const n = prev ? `${prev}\n${line}` : line; latestRef.current = n; return n; });
    if (rightPanel !== "transcript") setUnreadTx(n => n + 1);
    if (!meetingIdRef.current || !token) return;
    fetch(`${API}/api/append-transcript/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meeting_id: meetingIdRef.current, line }),
    }).catch(console.error);
  }, [myRole, myName, token, rightPanel]);

  const _startSttCapture = useCallback((ws) => {
    if (!localStreamRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      const src  = ctx.createMediaStreamSource(localStreamRef.current);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      proc.onaudioprocess = e => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const f32 = e.inputBuffer.getChannelData(0);
        if (_rms(f32) < 0.002) return;
        ws.send(_prefixed(_toInt16(f32)));
      };
      src.connect(proc); proc.connect(ctx.destination);
    } catch (err) { console.error("STT capture error:", err); }
  }, []);

  const _openSttWs = useCallback(() => {
    if (sttWsRef.current) return;
    setSttStatus("connecting");
    const nameEncoded = encodeURIComponent(myName);
    const ws = new WebSocket(`${WS}/ws/stt/room/?role=${myRole}&name=${nameEncoded}`);
    ws.binaryType = "arraybuffer";
    sttWsRef.current = ws;
    ws.onopen  = () => {};
    ws.onmessage = evt => {
      if (!isMountedRef.current) return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "stt_ready") { setSttStatus("live"); _startSttCapture(ws); }
        if (msg.type === "stt_error") setSttStatus("error");
        if (msg.type === "transcript" && msg.is_final && msg.text) {
          const text = msg.text.trim();
          bufRef.current = bufRef.current ? `${bufRef.current} ${text}` : text;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(_flushBuffer, COMMIT_DELAY);
        }
      } catch (e) { console.error(e); }
    };
    ws.onerror  = () => setSttStatus("error");
    ws.onclose  = () => { setSttStatus(""); sttWsRef.current = null; };
  }, [_startSttCapture, _flushBuffer, myRole, myName]);

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const next = !micOn;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; setCamOn(c => !c); });
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || !sigWsRef.current || sigWsRef.current.readyState !== WebSocket.OPEN) return;
    sigWsRef.current.send(JSON.stringify({ type: "chat", text }));
    setChatMessages(prev => [...prev, { id: Date.now(), from: myName, role: myRole, text, ts: new Date().toISOString(), self: true }]);
    setChatInput("");
  };

  const handleEndCall = async () => {
    _flushBuffer();
    if (meetingIdRef.current && latestRef.current && token) {
      try {
        await fetch(`${API}/api/meeting/end/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ meeting_id: meetingIdRef.current, speech_to_text: latestRef.current }),
        });
      } catch (e) { console.error(e); }
    }
    _cleanup();
    const roleRoutes = { doctor:"/doctor", admin:"/admin", patient:"/patient", sales:"/sales" };
    navigate(roleRoutes[myRole] || "/");
  };

  const _cleanup = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    try { procRef.current?.disconnect(); } catch (_) {}
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null;
    }
    if (sttWsRef.current) { sttWsRef.current.close(); sttWsRef.current = null; }
    Object.values(peersRef.current).forEach(({ pc }) => pc.close());
    peersRef.current = {};
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    sigWsRef.current?.close();
  };

  const totalVideos = 1 + remotes.length;
  const gridClass   = totalVideos === 1 ? "grid-1"
                    : totalVideos === 2 ? "grid-2"
                    : totalVideos <= 4  ? "grid-4"
                    : "grid-many";

  const leaveRoom = () => {
    _cleanup();
    const roleRoutes = { doctor:"/doctor", admin:"/admin", patient:"/patient", sales:"/sales" };
    navigate(roleRoutes[myRole] || "/");
  };

  return (
    <div className="mr-root">

      {/* TOP BAR */}
      <header className="mr-topbar">
        <div className="mr-topbar-left">
          <div className="mr-meeting-info">
            <span className="mr-room-id">#{roomId?.slice(-8)}</span>
            {meetingEnded
              ? <span className="mr-ended-pill">🔴 Meeting Ended</span>
              : connected && <span className="mr-live-pill"><span className="mr-live-dot" /> {fmt(duration)}</span>
            }
          </div>
          <div className="mr-participants-pill">
            {[{ id:"me", name: myName, role: myRole }, ...participants].map(p => (
              <span key={p.id} className="mr-avatar" style={{ borderColor: roleColor(p.role) }} title={`${p.name} (${p.role})`}>
                {roleIcon(p.role)}
              </span>
            ))}
            <span className="mr-count">{1 + participants.length} in call</span>
          </div>
        </div>
        <div className="mr-topbar-right">
          <div className="mr-stt-pill">
            {sttStatus === "connecting" && <span className="mr-badge amber">⏳ STT</span>}
            {sttStatus === "live"       && <span className="mr-badge green">🎙 Live</span>}
            {sttStatus === "error"      && <span className="mr-badge red">✗ STT</span>}
          </div>
          <button className={`mr-panel-btn ${rightPanel === "chat" ? "active" : ""}`}
            onClick={() => setRightPanel(p => p === "chat" ? null : "chat")} title="Room Chat">
            <img src="/SVG/chat.svg" alt="Chat" className="mr-icon" /> {unreadChat > 0 && <span className="mr-badge-dot">{unreadChat}</span>}
          </button>
          <button className={`mr-panel-btn ${rightPanel === "transcript" ? "active" : ""}`}
            onClick={() => setRightPanel(p => p === "transcript" ? null : "transcript")} title="Transcript">
            <img src="/SVG/transcript.svg" alt="Transcript" className="mr-icon" /> {unreadTx > 0 && <span className="mr-badge-dot">{unreadTx}</span>}
          </button>
        </div>
      </header>

      {error && (
        <div className="mr-error">
          ⚠ {error}
          <button onClick={() => window.location.reload()}>🔄 Reload</button>
        </div>
      )}

      {meetingEnded && (
        <div className="mr-ended-banner">
          🔴 This meeting has ended. You may review the transcript before leaving.
          <button className="mr-ended-leave" onClick={leaveRoom}>Leave Room</button>
        </div>
      )}

      {/* MAIN */}
      <div className="mr-body">
        <main className={`mr-grid ${gridClass} ${rightPanel ? "panel-open" : ""}`}>
          <VideoTile stream={localStream} name={myName} role={myRole} muted={true} label="You" />
          {remotes.map(r => (
            <VideoTile key={r.id} stream={r.stream} name={r.name} role={r.role} muted={false} />
          ))}
          {remotes.length === 0 && connected && !meetingEnded && (
            <div className="mr-waiting">
              <div className="mr-waiting-icon">⏳</div>
              <p>Waiting for others to join…</p>
              <p className="mr-waiting-sub">Share this link:</p>
              <input readOnly className="mr-share-link"
                value={`${window.location.origin}/room/${roomId}?meeting_id=${meetingId || ""}&role=`}
                onClick={e => { e.target.select(); navigator.clipboard.writeText(e.target.value); }} />
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        {rightPanel && (
          <aside className="mr-panel">
            <div className="mr-panel-header">
              <div className="mr-panel-tabs">
                <button className={`mr-tab ${rightPanel === "chat" ? "active" : ""}`}
                  onClick={() => setRightPanel("chat")}><img src="/SVG/chat.svg" alt="Chat" className="mr-tab-icon" /> Chat</button>
                <button className={`mr-tab ${rightPanel === "transcript" ? "active" : ""}`}
                  onClick={() => setRightPanel("transcript")}><img src="/SVG/transcript.svg" alt="Transcript" className="mr-tab-icon" /> Transcript</button>
              </div>
              <button className="mr-panel-close" onClick={() => setRightPanel(null)}>✕</button>
            </div>

            {rightPanel === "chat" && (
              <div className="mr-chat">
                <div className="mr-chat-messages">
                  {chatMessages.length === 0 && <div className="mr-chat-empty"><p>💬</p><p>No messages yet</p></div>}
                  {chatMessages.map(m => (
                    <div key={m.id} className={`mr-chat-msg ${m.self ? "self" : "other"}`}>
                      {!m.self && <div className="mr-msg-sender" style={{ color: roleColor(m.role) }}>{roleIcon(m.role)} {m.from}</div>}
                      <div className="mr-msg-bubble">{m.text}</div>
                      <div className="mr-msg-time">{fmt12(m.ts)}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="mr-chat-input">
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendChat()}
                    placeholder="Message everyone…" maxLength={500} />
                  <button onClick={sendChat} disabled={!chatInput.trim()}>➤</button>
                </div>
              </div>
            )}

            {rightPanel === "transcript" && (
              <div className="mr-transcript">
                <div className="mr-tx-header">
                  <span className="mr-tx-status">
                    {sttStatus === "live" && <span className="mr-live-dot" />}
                    {meetingEnded ? "Final Transcript" : sttStatus === "live" ? "Recording" : "Transcript"}
                  </span>
                  <button className="mr-tx-copy"
                    onClick={() => navigator.clipboard.writeText(transcript)}
                    disabled={!transcript} title="Copy transcript">📋</button>
                </div>
                <div className="mr-tx-body">
                  {transcript ? (
                    transcript.split("\n").map((line, i) => {
                      const r = line.startsWith("Doctor")  ? "doctor"
                              : line.startsWith("Patient") ? "patient"
                              : line.startsWith("Sales")   ? "sales"
                              : line.startsWith("Admin")   ? "admin"
                              : null;
                      return <div key={i} className="mr-tx-line" style={{ borderLeftColor: r ? roleColor(r) : "#334155" }}>{line}</div>;
                    })
                  ) : (
                    <div className="mr-tx-empty"><p>🎙</p><p>Transcript appears here when participants speak.</p></div>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* BOTTOM CONTROLS */}
      <footer className="mr-controls">
        <div className="mr-controls-left">
          <div className="mr-role-badge" style={{ borderColor: roleColor(myRole) }}>
            {roleIcon(myRole)} {myRole}
          </div>
        </div>
        <div className="mr-controls-center">
          <button className={`mr-ctrl-btn icon-only ${micOn ? "on" : "off"}`} onClick={toggleMic} disabled={meetingEnded} title={micOn ? "Mute" : "Unmute"}>
            <img src={micOn ? "/SVG/mute_call.svg" : "/SVG/Unmute.svg"} alt="Mic" className="mr-ctrl-svg" />
          </button>
          <button className={`mr-ctrl-btn icon-only ${camOn ? "on" : "off"}`} onClick={toggleCamera} disabled={meetingEnded} title={camOn ? "Stop Video" : "Start Video"}>
            <img src={camOn ? "/SVG/started_video.svg" : "/SVG/Video%20Off.svg"} alt="Camera" className="mr-ctrl-svg" />
          </button>
          {!meetingEnded && (
            <button className="mr-ctrl-btn icon-only end" onClick={handleEndCall} title="Leave">
              <img src="/SVG/Red_Cut_Call.svg" alt="Leave" className="mr-ctrl-svg" />
            </button>
          )}
          {meetingEnded && (
            <button className="mr-ctrl-btn icon-only end" onClick={leaveRoom} title="Exit">
              <img src="/SVG/Red_Cut_Call.svg" alt="Exit" className="mr-ctrl-svg" />
            </button>
          )}
        </div>

      </footer>

    </div>
  );
}