import React, { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./DoctorHome.css";

const API            = "http://localhost:8000";
const WS             = "ws://localhost:8000";
const DOCTOR_PREFIX  = 0x01;
const PATIENT_PREFIX = 0x02;
const MONTHS    = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const toDateStr = d => d.toISOString().split("T")[0];

export default function DoctorHome() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  // ── view state ────────────────────────────────────────────────────────────
  const [view, setView] = useState("calendar");
  const currentRoomRef = useRef(null);

  // ── calendar ──────────────────────────────────────────────────────────────
  const today = new Date();
  const [calYear,      setCalYear]      = useState(today.getFullYear());
  const [calMonth,     setCalMonth]     = useState(today.getMonth());
  const [appointments, setAppointments] = useState([]);
  const [clinics,      setClinics]      = useState([]);
  const [filterClinic, setFilterClinic] = useState("");
  const [selected,     setSelected]     = useState(null);

  // ── availability ──────────────────────────────────────────────────────────
  const [showAvail,   setShowAvail]   = useState(false);
  const [availDay,    setAvailDay]    = useState(0);
  const [availClinic, setAvailClinic] = useState("");
  const [availStart,  setAvailStart]  = useState("12:00");
  const [availEnd,    setAvailEnd]    = useState("13:00");
  const [availMsg,    setAvailMsg]    = useState("");

  // ── call UI ───────────────────────────────────────────────────────────────
  const [micOn,      setMicOn]      = useState(true);
  const [camOn,      setCamOn]      = useState(true);
  const [callReady,  setCallReady]  = useState(false);
  const [transcript, setTranscript] = useState("");
  const [patientUrl, setPatientUrl] = useState("");
  const [sttStatus,  setSttStatus]  = useState("");

  // ── video refs ────────────────────────────────────────────────────────────
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);

  // ── webrtc refs ───────────────────────────────────────────────────────────
  const peerRef         = useRef(null);
  const sigWsRef        = useRef(null);
  const mediaStreamRef  = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceQueueRef     = useRef([]);
  const callActiveRef   = useRef(false);
  const offerSentRef    = useRef(false);

  // ── stt refs ──────────────────────────────────────────────────────────────
  const sttWsRef        = useRef(null);
  const audioCtxRef     = useRef(null);
  const doctorProcRef   = useRef(null);
  const patientProcRef  = useRef(null);
  const patientPollRef  = useRef(null);

  // ── accumulator refs ──────────────────────────────────────────────────────
  const doctorBufRef    = useRef("");
  const patientBufRef   = useRef("");
  const doctorTimerRef  = useRef(null);
  const patientTimerRef = useRef(null);
  const COMMIT_DELAY    = 1200;

  // ── notes refs ────────────────────────────────────────────────────────────
  const autoSaveRef    = useRef(null);
  const latestRef      = useRef("");
  const meetingIdRef   = useRef(null);

  useEffect(() => { latestRef.current = transcript; }, [transcript]);
  useEffect(() => { if (!token) navigate("/"); }, [token, navigate]);
  useEffect(() => () => _cleanup(), []); // eslint-disable-line

  // ==========================================================================
  // Video initialization
  // ==========================================================================
  useEffect(() => {
    if (view === "call" && currentRoomRef.current && !callActiveRef.current) {
      console.log("🎬 Initializing call for room:", currentRoomRef.current);
      const timer = setTimeout(() => {
        if (localVideoRef.current && remoteVideoRef.current) {
          _startCall(currentRoomRef.current);
        } else {
          console.error("❌ Video refs not ready");
          alert("Video elements failed to initialize. Please try again.");
          setView("calendar");
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [view]);

  // ==========================================================================
  // DATA
  // ==========================================================================
  const loadAppointments = useCallback(async () => {
    const url = filterClinic
      ? `${API}/api/doctor/appointments/?clinic=${filterClinic}`
      : `${API}/api/doctor/appointments/`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setAppointments(await r.json());
    } catch(e) { console.error(e); }
  }, [token, filterClinic]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);
  useEffect(() => {
    fetch(`${API}/api/clinics/`).then(r=>r.json()).then(setClinics).catch(console.error);
  }, []);

  // ==========================================================================
  // CALENDAR
  // ==========================================================================
  const appointmentsOnDate = ds => appointments.filter(a => a.scheduled_time?.startsWith(ds));

  const renderCalendar = () => {
    const firstDay    = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    const cells = [];
    for (let i=0; i<firstDay; i++) cells.push(null);
    for (let d=1; d<=daysInMonth; d++) cells.push(d);
    return (
      <div className="calendar">
        <div className="cal-header">
          <button onClick={()=> calMonth===0?(setCalMonth(11),setCalYear(y=>y-1)):setCalMonth(m=>m-1)}>◀</button>
          <span>{MONTHS[calMonth]} {calYear}</span>
          <button onClick={()=> calMonth===11?(setCalMonth(0),setCalYear(y=>y+1)):setCalMonth(m=>m+1)}>▶</button>
        </div>
        <div className="cal-grid">
          {DAY_NAMES.map(d=><div key={d} className="cal-day-label">{d}</div>)}
          {cells.map((day,i)=>{
            if(!day) return <div key={`e${i}`} className="cal-cell empty"/>;
            const ds=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const appts=appointmentsOnDate(ds);
            const isToday=ds===toDateStr(new Date());
            return(
              <div key={ds} className={`cal-cell ${isToday?"today":""} ${appts.length?"has-appt":""}`}
                onClick={()=>appts.length&&setSelected(appts[0])}>
                <span className="day-num">{day}</span>
                {appts.length>0&&<span className="appt-dot">{appts.length}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ==========================================================================
  // APPOINTMENT CARD (Updated Logic)
  // ==========================================================================
  const handleStartAppt = async (appt) => {
    console.log("🚀 Starting appointment:", appt.meeting_id);
    
    try {
      const res = await fetch(`${API}/api/meeting/start/`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ meeting_id: appt.meeting_id }),
      });
      
      const data = await res.json();
      
      if (!res.ok) { 
        console.error("❌ Start meeting failed:", data);
        alert(data.error || "Cannot start appointment");
        return;
      }

      console.log("✅ Meeting started:", data);
      
      meetingIdRef.current = data.meeting_id;
      currentRoomRef.current = data.room_id;
      setPatientUrl(data.patient_url);
      setSelected(null);
      setView("call");

    } catch(e) { 
      console.error("❌ Exception starting appointment:", e);
      alert("Error starting appointment: " + e.message);
    }
  };

  const renderCard = (appt) => {
    const pp = appt.participants?.find(p=>p.role==="patient")||{};
    const isEnded = appt.status === "ended";

    return (
      <div className="appt-card-overlay" onClick={()=>setSelected(null)}>
        <div className="appt-card" onClick={e=>e.stopPropagation()}>
          <button className="card-close" onClick={()=>setSelected(null)}>✕</button>
          
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h3>📋 Appointment Details</h3>
            {isEnded && <span style={{background:"#cbd5e1",color:"#475569",padding:"2px 8px",borderRadius:4,fontSize:12,fontWeight:"bold"}}>COMPLETED</span>}
          </div>

          <div className="card-grid">
            <div className="card-field"><label>1. First Name</label>    <span>{appt.patient_name?.split(" ")[0]||"—"}</span></div>
            <div className="card-field"><label>2. Last Name</label>     <span>{appt.patient_name?.split(" ").slice(1).join(" ")||"—"}</span></div>
            <div className="card-field"><label>3. Sex at Birth</label>  <span>{pp.sex||"—"}</span></div>
            <div className="card-field"><label>4. Mobile No.</label>    <span>{pp.mobile||"—"}</span></div>
            <div className="card-field"><label>5. Date of Birth</label> <span>{pp.dob||"—"}</span></div>
            <div className="card-field"><label>6. Email ID</label>      <span>{pp.email||"—"}</span></div>
            <div className="card-field"><label>7. Department</label>    <span>{appt.department||"—"}</span></div>
            <div className="card-field"><label>8. Personnel</label>     <span>Dr. {appt.doctor_name}</span></div>
            <div className="card-field"><label>9. Reason</label>        <span>{appt.appointment_reason||"—"}</span></div>
            <div className="card-field"><label>10. Date</label>         <span>{appt.scheduled_time?.split("T")[0]||"—"}</span></div>
            <div className="card-field"><label>11. Time</label>         <span>{appt.scheduled_time?.split("T")[1]?.slice(0,5)||"—"}</span></div>
            <div className="card-field"><label>12. Remark</label>       <span>{appt.remark||"—"}</span></div>
          </div>
          
          {/* ── Condition: If Ended, show Notes. Else, show Start Button ── */}
          {isEnded ? (
            <div style={{marginTop: 15, borderTop: "1px solid #e2e8f0", paddingTop: 10}}>
                <h4 style={{margin:"0 0 5px 0", fontSize:14, color:"#334155"}}>📝 Consultation Notes / Transcript</h4>
                <div style={{
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 13,
                    color: "#334155",
                    maxHeight: 150,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace"
                }}>
                    {appt.speech_to_text ? appt.speech_to_text : <em style={{color:"#94a3b8"}}>No notes recorded for this session.</em>}
                </div>
            </div>
          ) : (
            <div className="card-start-row">
                <button className="btn-start-green" onClick={()=>handleStartAppt(appt)}>
                🟢 Start Appointment
                </button>
            </div>
          )}
          
        </div>
      </div>
    );
  };

  // ==========================================================================
  // AVAILABILITY
  // ==========================================================================
  const handleSetAvailability = async (e) => {
    e.preventDefault(); setAvailMsg("");
    try {
      const res = await fetch(`${API}/api/doctor/set-availability/`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({clinic:parseInt(availClinic),day_of_week:parseInt(availDay),start_time:availStart,end_time:availEnd}),
      });
      const data = await res.json();
      if (!res.ok) { setAvailMsg("❌ "+(data.error||"Failed")); return; }
      setAvailMsg("✅ Saved!");
    } catch { setAvailMsg("❌ Server error"); }
  };

  // ==========================================================================
  // STT HELPERS
  // ==========================================================================
  const _toInt16 = f32 => {
    const out=new Int16Array(f32.length);
    for(let i=0;i<f32.length;i++){const s=Math.max(-1,Math.min(1,f32[i]));out[i]=s<0?s*0x8000:s*0x7fff;}
    return out.buffer;
  };
  const _rms = buf => { let s=0; for(let i=0;i<buf.length;i++)s+=buf[i]*buf[i]; return Math.sqrt(s/buf.length); };
  const _prefixed = (pcm,prefix) => { const out=new Uint8Array(1+pcm.byteLength); out[0]=prefix; out.set(new Uint8Array(pcm),1); return out.buffer; };

  const _flushSpeaker = useCallback((speaker) => {
    const isDoc  = speaker==="Doctor";
    const bufRef = isDoc?doctorBufRef:patientBufRef;
    const tmrRef = isDoc?doctorTimerRef:patientTimerRef;
    const text   = bufRef.current.trim();
    bufRef.current="";
    if(tmrRef.current){clearTimeout(tmrRef.current);tmrRef.current=null;}
    if(!text) return;
    const line=`${speaker}: ${text}`;
    setTranscript(prev=>{const n=prev?`${prev}\n${line}`:line;latestRef.current=n;return n;});
    if(!meetingIdRef.current) return;
    fetch(`${API}/api/append-transcript/`,{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
      body:JSON.stringify({meeting_id:meetingIdRef.current,line}),
    }).catch(console.error);
  },[token]);

  const _accumulateFinal = useCallback((speaker,text)=>{
    if(!text?.trim()) return;
    const isDoc=speaker==="Doctor";
    const bufRef=isDoc?doctorBufRef:patientBufRef;
    const tmrRef=isDoc?doctorTimerRef:patientTimerRef;
    bufRef.current=bufRef.current?`${bufRef.current} ${text}`:text;
    if(tmrRef.current) clearTimeout(tmrRef.current);
    tmrRef.current=setTimeout(()=>_flushSpeaker(speaker),COMMIT_DELAY);
  },[_flushSpeaker]);

  const _persistNotes = useCallback(async mId=>{
    if(!mId||!latestRef.current) return;
    try {
      await fetch(`${API}/api/meeting/end/`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({meeting_id:mId,speech_to_text:latestRef.current}),
      });
    } catch(e){console.error(e);}
  },[token]);

  const _startAutoSave = useCallback(mId=>{
    if(autoSaveRef.current) clearInterval(autoSaveRef.current);
    autoSaveRef.current=setInterval(()=>_persistNotes(mId),10_000);
  },[_persistNotes]);

  const _stopAudioCapture = () => {
    if(patientPollRef.current){clearInterval(patientPollRef.current);patientPollRef.current=null;}
    try{doctorProcRef.current?.disconnect();}catch(_){}
    try{patientProcRef.current?.disconnect();}catch(_){}
    doctorProcRef.current=patientProcRef.current=null;
    if(audioCtxRef.current&&audioCtxRef.current.state!=="closed"){
      audioCtxRef.current.close().catch(()=>{});audioCtxRef.current=null;
    }
  };

  const _startAudioCapture = useCallback(ws=>{
    try {
      const ctx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:16000});
      audioCtxRef.current=ctx;
      const CHUNK=4096,GATE=0.002;
      
      // Doctor's own audio
      if(mediaStreamRef.current){
        const src=ctx.createMediaStreamSource(mediaStreamRef.current);
        const proc=ctx.createScriptProcessor(CHUNK,1,1);
        doctorProcRef.current=proc;
        proc.onaudioprocess=e=>{
          if(ws.readyState!==WebSocket.OPEN)return;
          const f32=e.inputBuffer.getChannelData(0);
          if(_rms(f32)<GATE)return;
          ws.send(_prefixed(_toInt16(f32),DOCTOR_PREFIX));
        };
        src.connect(proc);proc.connect(ctx.destination);
      }
      
      // Patient's audio
      const attachPatient=stream=>{
        if(!stream||patientProcRef.current)return;
        const src=ctx.createMediaStreamSource(stream);
        const proc=ctx.createScriptProcessor(CHUNK,1,1);
        patientProcRef.current=proc;
        proc.onaudioprocess=e=>{
          if(ws.readyState!==WebSocket.OPEN)return;
          const f32=e.inputBuffer.getChannelData(0);
          if(_rms(f32)<GATE)return;
          ws.send(_prefixed(_toInt16(f32),PATIENT_PREFIX));
        };
        src.connect(proc);proc.connect(ctx.destination);
      };
      
      if(remoteStreamRef.current){
        attachPatient(remoteStreamRef.current);
      } else {
        let tries=0;
        patientPollRef.current=setInterval(()=>{
          if(remoteStreamRef.current){
            attachPatient(remoteStreamRef.current);
            clearInterval(patientPollRef.current);
            patientPollRef.current=null;
          }
          else if(++tries>60){
            clearInterval(patientPollRef.current);
            patientPollRef.current=null;
          }
        },500);
      }
    } catch(err){console.error("❌ audio capture:",err);}
  },[]);

  const _openSttWs = useCallback(()=>{
    if(sttWsRef.current)return;
    setSttStatus("connecting");
    const ws=new WebSocket(`${WS}/ws/stt/`);
    ws.binaryType="arraybuffer";
    sttWsRef.current=ws;
    ws.onopen=()=>console.log("✅ STT WS open");
    ws.onmessage=evt=>{
      try{
        const msg=JSON.parse(evt.data);
        if(msg.type==="stt_ready"){
          setSttStatus("live");
          _startAudioCapture(ws);
        }
        if(msg.type==="stt_error"){
          setSttStatus("error");
        }
        if(msg.type==="transcript"&&msg.is_final&&msg.text){
          _accumulateFinal(msg.speaker,msg.text);
        }
      }catch(e){console.error(e);}
    };
    ws.onerror=()=>setSttStatus("error");
    ws.onclose=()=>{setSttStatus("");sttWsRef.current=null;_stopAudioCapture();};
  },[_accumulateFinal,_startAudioCapture]);

  // ==========================================================================
  // WEBRTC
  // ==========================================================================
  const _sendOffer = useCallback(async()=>{
    if(offerSentRef.current) return;
    offerSentRef.current=true;
    try {
      const offer=await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);
      sigWsRef.current.send(JSON.stringify({type:"offer",offer}));
    } catch(err) {
      offerSentRef.current=false;
    }
  },[]);

  const _startCall = async room=>{
    if(callActiveRef.current) return;
    
    callActiveRef.current=true;
    offerSentRef.current=false;

    if(!localVideoRef.current || !remoteVideoRef.current){
      alert("Video elements failed to initialize. Please try again.");
      callActiveRef.current=false;
      setView("calendar");
      return;
    }

    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
      mediaStreamRef.current=stream;
      localVideoRef.current.srcObject=stream;
      setCallReady(true);

      peerRef.current=new RTCPeerConnection({
        iceServers:[
          {urls:"stun:stun.l.google.com:19302"},
          {urls:"stun:stun1.l.google.com:19302"}
        ],
        iceCandidatePoolSize:10,
      });
      
      stream.getTracks().forEach(t=>{
        peerRef.current.addTrack(t,stream);
      });

      peerRef.current.ontrack=evt=>{
        const rv=remoteVideoRef.current;
        if(!rv||rv.srcObject===evt.streams[0])return;
        rv.srcObject=evt.streams[0];
        remoteStreamRef.current=evt.streams[0];
        rv.onloadedmetadata=()=>{
          rv.play().catch(e=>console.warn("Play error:",e));
        };
      };

      peerRef.current.onicecandidate=evt=>{
        if(!evt.candidate)return;
        if(sigWsRef.current?.readyState===WebSocket.OPEN&&peerRef.current.remoteDescription){
          sigWsRef.current.send(JSON.stringify({type:"ice",candidate:evt.candidate}));
        }
      };

      const ws=new WebSocket(`${WS}/ws/call/${room}/`);
      sigWsRef.current=ws;
      
      ws.onopen=()=>{
        ws.send(JSON.stringify({type:"doctor_ready"}));
      };
      
      ws.onmessage=async evt=>{
        let msg;
        try{msg=JSON.parse(evt.data);}catch{return;}
        
        switch(msg.type){
          case"ready":
            await _sendOffer();
            break;
          case"answer":
            try {
              await peerRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer));
              for(const c of iceQueueRef.current){
                await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
              }
              iceQueueRef.current=[];
              _openSttWs();
            } catch(err) { console.error(err); }
            break;
          case"ice":
            if(!msg.candidate)break;
            if(peerRef.current.remoteDescription){
              await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            }else{
              iceQueueRef.current.push(msg.candidate);
            }
            break;
          default: break;
        }
      };
      
      ws.onerror=e=>{
        alert("WebSocket connection failed. Make sure Django is running on port 8000.");
      };
      
      _startAutoSave(meetingIdRef.current);

    }catch(err){
      callActiveRef.current=false;
      alert(`Failed to start call: ${err.message}`);
      setView("calendar");
    }
  };

  const _cleanup = useCallback(()=>{
    _flushSpeaker("Doctor");
    _flushSpeaker("Patient");
    if(doctorTimerRef.current){clearTimeout(doctorTimerRef.current);doctorTimerRef.current=null;}
    if(patientTimerRef.current){clearTimeout(patientTimerRef.current);patientTimerRef.current=null;}
    if(sttWsRef.current){sttWsRef.current.close();sttWsRef.current=null;}
    if(autoSaveRef.current){clearInterval(autoSaveRef.current);autoSaveRef.current=null;}
    _stopAudioCapture();
    mediaStreamRef.current?.getTracks().forEach(t=>t.stop());
    peerRef.current?.close();
    sigWsRef.current?.close();
    callActiveRef.current=false;
    offerSentRef.current=false;
    iceQueueRef.current=[];
    currentRoomRef.current=null;
  },[_flushSpeaker]);

  const endCall = async()=>{
    const mId=meetingIdRef.current;
    _flushSpeaker("Doctor");
    _flushSpeaker("Patient");
    await new Promise(r=>setTimeout(r,200));
    await _persistNotes(mId);
    _cleanup();
    setCallReady(false);
    setSttStatus("");
    alert("Consultation ended. Transcript saved ✅");
    setView("calendar");
    setTranscript("");
    loadAppointments();
  };

  const toggleMic=()=>{
    if(!mediaStreamRef.current)return;
    const next=!micOn;
    mediaStreamRef.current.getAudioTracks().forEach(t=>{t.enabled=next;});
    setMicOn(next);
  };
  
  const toggleCamera=()=>{
    if(!mediaStreamRef.current)return;
    mediaStreamRef.current.getVideoTracks().forEach(t=>{t.enabled=!t.enabled;setCamOn(t.enabled);});
  };
  
  const handleLogout=()=>{
    _cleanup();
    localStorage.clear();
    navigate("/");
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="doctor-container">

      <div className="doctor-topbar">
        <h2>🩺 Doctor Console</h2>
        <div className="topbar-actions">
          {view==="call"&&(
            <button className="btn secondary" onClick={()=>{
              _cleanup();
              setView("calendar");
              setCallReady(false);
              setSttStatus("");
            }}>
              ← Back to Calendar
            </button>
          )}
          <button className="btn secondary" onClick={()=>setShowAvail(v=>!v)}>🕐 Set Availability</button>
          <button className="btn danger-sm" onClick={handleLogout}>🚪 Logout</button>
        </div>
      </div>

      {showAvail&&(
        <div className="avail-panel">
          <h3>Set Your Working Hours</h3>
          <form onSubmit={handleSetAvailability} className="avail-form">
            <select value={availClinic} onChange={e=>setAvailClinic(e.target.value)} required>
              <option value="">Select Clinic</option>
              {clinics.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={availDay} onChange={e=>setAvailDay(e.target.value)}>
              {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((d,i)=>(
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
            <input type="time" value={availStart} onChange={e=>setAvailStart(e.target.value)}/>
            <span style={{color:"#64748b"}}>to</span>
            <input type="time" value={availEnd} onChange={e=>setAvailEnd(e.target.value)}/>
            <button type="submit" className="btn primary">Save</button>
          </form>
          {availMsg&&<p className="avail-msg">{availMsg}</p>}
        </div>
      )}

      {view==="calendar"&&(
        <div className="cal-view">
          <div className="cal-toolbar">
            <span className="cal-title">📅 My Appointments</span>
            <select value={filterClinic} onChange={e=>setFilterClinic(e.target.value)} className="clinic-filter">
              <option value="">All Clinics</option>
              {clinics.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {renderCalendar()}
          <div className="upcoming-list">
            <h3>Upcoming ({appointments.length})</h3>
            {!appointments.length&&<p className="empty">No appointments found.</p>}
            {appointments.slice(0,10).map(a=>(
              <div key={a.meeting_id} className="upcoming-row" onClick={()=>setSelected(a)}>
                <span className="urow-time">{a.scheduled_time?.split("T")[0]} {a.scheduled_time?.split("T")[1]?.slice(0,5)}</span>
                <span className="urow-patient">👤 {a.patient_name}</span>
                <span className="urow-reason">{a.appointment_reason||"—"}</span>
                <span className="urow-clinic">{a.clinic_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="call"&&(
        <div className="call-view">
          {patientUrl&&(
            <div style={{background:"rgba(30,41,59,0.8)",border:"1px solid #334155",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
              <p style={{margin:"0 0 6px",fontSize:13,color:"#94a3b8"}}>📎 Share this link with your patient:</p>
              <input readOnly value={patientUrl} onClick={e=>e.target.select()}
                style={{width:"100%",fontFamily:"monospace",fontSize:12,background:"#0f172a",color:"#f8fafc",border:"1px solid #475569",borderRadius:6,padding:"6px 10px",boxSizing:"border-box"}}/>
            </div>
          )}

          <div className="video-section">
            <div style={{position:"relative",flex:1}}>
              <video ref={localVideoRef} autoPlay playsInline muted className="video-box" style={{background:"#000"}} />
              <span style={{position:"absolute",bottom:10,left:14,background:"rgba(0,0,0,0.6)",borderRadius:5,padding:"2px 10px",fontSize:12,color:"#94a3b8"}}>You (Doctor)</span>
            </div>
            <div style={{position:"relative",flex:1}}>
              <video ref={remoteVideoRef} autoPlay playsInline className="video-box" style={{background:"#000"}} />
              <span style={{position:"absolute",bottom:10,left:14,background:"rgba(0,0,0,0.6)",borderRadius:5,padding:"2px 10px",fontSize:12,color:"#94a3b8"}}>Patient</span>
            </div>
          </div>

          <div className="controls">
            <button className="btn secondary" onClick={toggleMic}>{micOn?"🎤 Mute":"🔇 Unmute"}</button>
            <button className="btn secondary" onClick={toggleCamera}>{camOn?"📷 Camera Off":"🚫 Camera On"}</button>
            <button className="btn danger" onClick={endCall} disabled={!callReady}>🔴 End Call</button>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <span style={{fontSize:13,color:"#64748b"}}>🎙️ Transcription:</span>
            {sttStatus===""        &&<span style={{color:"#64748b",fontSize:13}}>Waiting for patient to join…</span>}
            {sttStatus==="connecting"&&<span style={{color:"#fbbf24",fontWeight:"bold",fontSize:13}}>⏳ Connecting to Deepgram…</span>}
            {sttStatus==="live"    &&<span style={{color:"#4ade80",fontWeight:"bold",fontSize:13}}>🟢 Live — both speakers active</span>}
            {sttStatus==="error"   &&<span style={{color:"#ef4444",fontWeight:"bold",fontSize:13}}>❌ STT error</span>}
          </div>

          <div className="notes-section">
            <h3>📝 Live Transcript (Both Speakers)</h3>
            <textarea rows={14} value={transcript}
              onChange={e=>{setTranscript(e.target.value);latestRef.current=e.target.value;}}
              placeholder="Transcript appears here automatically once both are connected…"/>
          </div>
        </div>
      )}

      {selected&&renderCard(selected)}
    </div>
  );
}