// src/components/PatientCall.js
import React, { useRef, useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import "./PatientHome.css";

const API            = "http://localhost:8000";
const WS             = "ws://localhost:8000";
const PATIENT_PREFIX = 0x02;
const COMMIT_DELAY   = 1200;

export default function PatientCall() {
  const { roomId }     = useParams();
  const [searchParams] = useSearchParams();
  const meetingId      = searchParams.get("meeting_id");
  const token          = localStorage.getItem("token");

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerRef        = useRef(null);
  const socketRef      = useRef(null);
  const iceQueueRef    = useRef([]);
  const answerSentRef  = useRef(false);
  const isMountedRef   = useRef(true);
  const sttWsRef       = useRef(null);
  const audioCtxRef    = useRef(null);
  const procRef        = useRef(null);
  
  // FIXED: Separate buffers for doctor and patient
  const doctorBufRef   = useRef("");
  const patientBufRef  = useRef("");
  const doctorTimerRef = useRef(null);
  const patientTimerRef= useRef(null);
  const latestRef      = useRef("");

  const [micOn,      setMicOn]      = useState(true);
  const [camOn,      setCamOn]      = useState(true);
  const [connected,  setConnected]  = useState(false);
  const [error,      setError]      = useState("");
  const [transcript, setTranscript] = useState("");
  const [sttStatus,  setSttStatus]  = useState("");

  useEffect(()=>{latestRef.current=transcript;},[transcript]);

  useEffect(()=>{
    isMountedRef.current=true;
    if(!roomId){setError("Invalid link — room ID missing from URL.");return;}
    const timer = setTimeout(() => {if(isMountedRef.current) joinCall();}, 100);
    return()=>{clearTimeout(timer);isMountedRef.current=false;_cleanup();};
  },[]); // eslint-disable-line

  const _toInt16=f32=>{
    const out=new Int16Array(f32.length);
    for(let i=0;i<f32.length;i++){const s=Math.max(-1,Math.min(1,f32[i]));out[i]=s<0?s*0x8000:s*0x7fff;}
    return out.buffer;
  };
  const _rms=buf=>{let s=0;for(let i=0;i<buf.length;i++)s+=buf[i]*buf[i];return Math.sqrt(s/buf.length);};
  const _prefixed=(pcm,prefix)=>{const out=new Uint8Array(1+pcm.byteLength);out[0]=prefix;out.set(new Uint8Array(pcm),1);return out.buffer;};

  // FIXED: Flush both doctor and patient buffers
  const _flushSpeaker = useCallback((speaker)=>{
    const isDoc=speaker==="Doctor";
    const bufRef=isDoc?doctorBufRef:patientBufRef;
    const tmrRef=isDoc?doctorTimerRef:patientTimerRef;
    const text=bufRef.current.trim();
    bufRef.current="";
    if(tmrRef.current){clearTimeout(tmrRef.current);tmrRef.current=null;}
    if(!text)return;
    const line=`${speaker}: ${text}`;
    console.log(`📝 [${speaker}] Flushing:`, line);
    setTranscript(prev=>{const n=prev?`${prev}\n${line}`:line;latestRef.current=n;return n;});
    if(meetingId&&token){
      fetch(`${API}/api/append-transcript/`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({meeting_id:parseInt(meetingId),line}),
      }).catch(console.error);
    }
  },[meetingId,token]);

  const _accumulateFinal = useCallback((speaker,text)=>{
    if(!text?.trim()) return;
    const isDoc=speaker==="Doctor";
    const bufRef=isDoc?doctorBufRef:patientBufRef;
    const tmrRef=isDoc?doctorTimerRef:patientTimerRef;
    bufRef.current=bufRef.current?`${bufRef.current} ${text}`:text;
    if(tmrRef.current) clearTimeout(tmrRef.current);
    tmrRef.current=setTimeout(()=>_flushSpeaker(speaker),COMMIT_DELAY);
  },[_flushSpeaker]);

  // FIXED: Always send audio to STT regardless of mute state
  const _startPatientAudio = useCallback(ws=>{
    if(!localStreamRef.current){console.warn("⚠️ No local stream for STT");return;}
    try{
      console.log("🎙️ Starting patient audio capture...");
      const ctx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:16000});
      audioCtxRef.current=ctx;
      const src=ctx.createMediaStreamSource(localStreamRef.current);
      const proc=ctx.createScriptProcessor(4096,1,1);
      procRef.current=proc;
      let chunksSent = 0;
      proc.onaudioprocess=e=>{
        if(ws.readyState!==WebSocket.OPEN)return;
        const f32=e.inputBuffer.getChannelData(0);
        if(_rms(f32)<0.001) return;
        // Always send to STT even if muted
        ws.send(_prefixed(_toInt16(f32),PATIENT_PREFIX));
        chunksSent++;
        if(chunksSent === 1) console.log("✅ Patient audio → STT (first chunk sent)");
        if(chunksSent % 100 === 0) console.log(`📊 [Patient] Sent ${chunksSent} chunks`);
      };
      src.connect(proc);proc.connect(ctx.destination);
      console.log("✅ Patient audio processor connected (always active)");
    }catch(err){console.error("❌ Patient audio capture failed:",err);}
  },[]);

  const _openSttWs = useCallback(()=>{
    if(sttWsRef.current){console.log("⚠️ STT WS already open");return;}
    console.log("🔌 Opening patient STT WebSocket...");
    setSttStatus("connecting");
    const ws=new WebSocket(`${WS}/ws/stt/`);
    ws.binaryType="arraybuffer";
    sttWsRef.current=ws;
    ws.onopen=()=>console.log("✅ Patient STT WS open");
    ws.onmessage=evt=>{
      if(!isMountedRef.current)return;
      try{
        const msg=JSON.parse(evt.data);
        console.log("📩 [STT]", msg.type, msg.speaker);
        if(msg.type==="stt_ready"){
          console.log("✅ STT ready");
          setSttStatus("live");
          _startPatientAudio(ws);
        }
        if(msg.type==="stt_error"){
          console.error("❌ STT error:", msg.message);
          setSttStatus("error");
        }
        // FIXED: Handle transcripts from BOTH speakers
        if(msg.type==="transcript" && msg.is_final && msg.text){
          console.log(`📝 [${msg.speaker} STT] "${msg.text}"`);
          _accumulateFinal(msg.speaker, msg.text);
        }
      }catch(e){console.error("❌ STT parse error:",e);}
    };
    ws.onerror=e=>{console.error("❌ STT WS error:",e);setSttStatus("error");};
    ws.onclose=()=>{console.log("🔌 STT WS closed");setSttStatus("");sttWsRef.current=null;};
  },[_startPatientAudio,_accumulateFinal]);

  const joinCall = async()=>{
    console.log("🎬 Patient joining call - room:", roomId);
    try{
      let stream;
      try{
        console.log("📹 Requesting camera and microphone...");
        stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
        console.log("✅ Got media stream");
      }catch(err){
        console.error("❌ Media error:", err);
        if(isMountedRef.current)
          setError(err.name==="NotAllowedError"
            ?"Camera/mic permission denied. Click Allow and reload."
            :`Camera error: ${err.message}`);
        return;
      }
      if(!isMountedRef.current){stream.getTracks().forEach(t=>t.stop());return;}
      localStreamRef.current=stream;

      const attachLocal=()=>{
        if(!isMountedRef.current)return;
        if(localVideoRef.current){
          localVideoRef.current.srcObject=stream;
          console.log("✅ Patient local video attached");
        }
        else {requestAnimationFrame(attachLocal);}
      };
      attachLocal();

      console.log("🔗 Creating peer connection...");
      peerRef.current=new RTCPeerConnection({
        iceServers:[
          {urls:"stun:stun.l.google.com:19302"},
          {urls:"stun:stun1.l.google.com:19302"}
        ],
        iceCandidatePoolSize:10,
        iceTransportPolicy:"all",
      });
      stream.getTracks().forEach(t=>{
        peerRef.current.addTrack(t,stream);
        console.log("✅ Added track:", t.kind);
      });

      peerRef.current.ontrack=evt=>{
        if(!isMountedRef.current)return;
        console.log("📡 Received track from doctor:", evt.track.kind);
        const rv=remoteVideoRef.current;
        if(!rv||rv.srcObject===evt.streams[0])return;
        rv.srcObject=evt.streams[0];
        rv.onloadedmetadata=()=>{
          rv.play().catch(e=>console.warn("Play error:",e));
          console.log("✅ Doctor video playing");
        };
        console.log("🎙️ Doctor stream received, starting STT...");
        _openSttWs();
      };

      peerRef.current.onicecandidate=evt=>{
        if(!isMountedRef.current||!evt.candidate)return;
        if(peerRef.current?.remoteDescription){
          socketRef.current?.send(JSON.stringify({type:"ice",candidate:evt.candidate}));
        }
        else{iceQueueRef.current.push(evt.candidate);}
      };
      
      peerRef.current.oniceconnectionstatechange=()=>{
        console.log("🧊 ICE:",peerRef.current?.iceConnectionState);
        if(peerRef.current?.iceConnectionState==="disconnected"){
          console.warn("⚠️ Connection lost - may need to reconnect");
        }
      };

      console.log("🔌 Connecting to signalling server...");
      const ws=new WebSocket(`${WS}/ws/call/${roomId}/`);
      socketRef.current=ws;
      ws.onopen=()=>{
        if(!isMountedRef.current)return;
        console.log("✅ Patient signalling WS open");
        setConnected(true);
        ws.send(JSON.stringify({type:"ready"}));
      };
      ws.onmessage=async evt=>{
        if(!isMountedRef.current)return;
        let msg;try{msg=JSON.parse(evt.data);}catch{return;}
        console.log("📩 Patient recv:",msg.type);
        switch(msg.type){
          case"ready":case"doctor_ready":break;
          case"offer":
            if(answerSentRef.current)break;
            if(!peerRef.current||peerRef.current.signalingState!=="stable")break;
            answerSentRef.current=true;
            try{
              await peerRef.current.setRemoteDescription(new RTCSessionDescription(msg.offer));
              const answer=await peerRef.current.createAnswer();
              await peerRef.current.setLocalDescription(answer);
              ws.send(JSON.stringify({type:"answer",answer}));
              for(const c of iceQueueRef.current) {
                await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
              }
              iceQueueRef.current=[];
              console.log("✅ Answer sent");
            }catch(err){
              console.error("❌ Offer error:",err);
              answerSentRef.current=false;
            }
            break;
          case"ice":
            if(!msg.candidate)break;
            if(peerRef.current?.remoteDescription) {
              await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            }
            else {
              iceQueueRef.current.push(msg.candidate);
            }
            break;
          default:break;
        }
      };
      ws.onerror=e=>{
        console.error("❌ WebSocket error:",e);
        if(isMountedRef.current)setError("WebSocket failed. Is Django running on port 8000?");
      };
      ws.onclose=()=>{
        console.log("🔌 WebSocket closed");
        if(isMountedRef.current)setConnected(false);
      };
    }catch(err){
      console.error("❌ joinCall error:",err);
      if(isMountedRef.current)setError(`Unexpected error: ${err.message}`);
    }
  };

  const _cleanup=()=>{
    console.log("🧹 Cleaning up patient call...");
    
    // Flush any pending transcripts
    _flushSpeaker("Doctor");
    _flushSpeaker("Patient");
    
    if(doctorTimerRef.current){clearTimeout(doctorTimerRef.current);doctorTimerRef.current=null;}
    if(patientTimerRef.current){clearTimeout(patientTimerRef.current);patientTimerRef.current=null;}
    
    try{procRef.current?.disconnect();}catch(_){}
    if(audioCtxRef.current&&audioCtxRef.current.state!=="closed"){
      audioCtxRef.current.close().catch(()=>{});
      audioCtxRef.current=null;
    }
    if(sttWsRef.current){sttWsRef.current.close();sttWsRef.current=null;}
    localStreamRef.current?.getTracks().forEach(t=>{
      t.stop();
      console.log("🛑 Stopped track:",t.kind);
    });
    peerRef.current?.close();
    socketRef.current?.close();
    console.log("✅ Cleanup complete");
  };

  // FIXED: Mute only affects WebRTC peer, not STT
  const toggleMic=()=>{
    if(!localStreamRef.current)return;
    const next=!micOn;
    // This only mutes the track going to the peer connection
    // STT audio capture continues independently
    localStreamRef.current.getAudioTracks().forEach(t=>{t.enabled=next;});
    setMicOn(next);
    console.log(`🎤 Mic ${next?"ON":"OFF"} (peer only - STT still active)`);
  };
  
  const toggleCamera=()=>{
    if(!localStreamRef.current)return;
    localStreamRef.current.getVideoTracks().forEach(t=>{
      t.enabled=!t.enabled;
      setCamOn(t.enabled);
    });
  };

  return (
    <div className="container">
      <h2>👤 Patient Video Call</h2>
      {!error&&(<p style={{marginBottom:16}}>
        {connected?<span style={{color:"#4ade80",fontWeight:"bold"}}>✅ Connected to doctor</span>
        :<span style={{color:"#fbbf24",fontWeight:"bold"}}>⏳ Connecting...</span>}
      </p>)}
      {error&&(<div style={{background:"rgba(239,68,68,0.15)",border:"1px solid #ef4444",borderRadius:12,padding:"16px 20px",marginBottom:20,color:"#fca5a5"}}>
        ❌ {error}<br/><br/>
        <button onClick={()=>window.location.reload()} style={{background:"#ef4444",color:"white",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer"}}>🔄 Reload Page</button>
      </div>)}
      <div className="video-section">
        <div style={{position:"relative",flex:1}}>
          <video ref={localVideoRef} autoPlay playsInline muted className="video-box"/>
          <span style={{position:"absolute",bottom:10,left:14,background:"rgba(0,0,0,0.6)",borderRadius:6,padding:"2px 10px",fontSize:12,color:"#94a3b8"}}>You (Patient)</span>
        </div>
        <div style={{position:"relative",flex:1}}>
          <video ref={remoteVideoRef} autoPlay playsInline className="video-box"/>
          <span style={{position:"absolute",bottom:10,left:14,background:"rgba(0,0,0,0.6)",borderRadius:6,padding:"2px 10px",fontSize:12,color:"#94a3b8"}}>Doctor</span>
        </div>
      </div>
      <div className="controls">
        <button className="btn secondary" onClick={toggleMic}>
          {micOn?"🎤 Mute":"🔇 Unmute"}
        </button>
        <button className="btn secondary" onClick={toggleCamera}>
          {camOn?"📷 Camera Off":"🚫 Camera On"}
        </button>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <span style={{fontSize:13,color:"#64748b"}}>🎙️ Transcription:</span>
        {sttStatus===""&&connected&&<span style={{color:"#64748b",fontSize:13}}>Starts when doctor joins</span>}
        {sttStatus==="connecting"&&<span style={{color:"#fbbf24",fontWeight:"bold",fontSize:13}}>⏳ Connecting…</span>}
        {sttStatus==="live"&&<span style={{color:"#4ade80",fontWeight:"bold",fontSize:13}}>🟢 Live — both speakers active</span>}
        {sttStatus==="error"&&<span style={{color:"#ef4444",fontWeight:"bold",fontSize:13}}>❌ STT error</span>}
      </div>
      <div className="notes-section">
        <h3>📝 Live Transcript (Both Speakers)</h3>
        <textarea 
          rows={10} 
          value={transcript} 
          readOnly 
          placeholder="Transcript will appear here automatically…
Note: Muting only affects what the other person hears - transcription continues for both speakers."/>
      </div>
    </div>
  );
}