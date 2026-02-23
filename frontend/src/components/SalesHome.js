// src/components/SalesHome.js -- UPDATED
// Changes:
//  • Replaced dropdown time selector with clickable time grid (15-minute intervals)
//  • Shows all times from 00:00 to 23:45 in a responsive grid layout
//  • Available slots are highlighted, unavailable are dimmed
//  • Selected time is shown with orange gradient
//  • Backend now generates 15-minute interval slots

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL as API } from "../config";

const MONTHS    = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WEEK_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const toDateStr = d => d.toISOString().split("T")[0];
const todayStr  = () => toDateStr(new Date());
const SALES_MEETING_TYPE = "sales_meeting";

const to12h = (time24) => {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${mStr} ${ampm}`;
};
const to24h = (t12) => {
  if (!t12) return "00:00";
  const match = t12.match(/^(\d+):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "00:00";
  let [, hStr, mStr, ampm] = match;
  let h = parseInt(hStr, 10);
  if (ampm.toUpperCase() === "PM" && h !== 12) h += 12;
  if (ampm.toUpperCase() === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${mStr}`;
};
const timeFrom = (dt) => {
  if (!dt) return "";
  return to12h(dt.split("T")[1]?.slice(0, 5));
};

// 30-min time options for the availability selectors
const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (const m of ["00", "30"]) {
    const ampm = h < 12 ? "AM" : "PM";
    const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIME_OPTIONS.push(`${h12}:${m} ${ampm}`);
  }
}

export default function SalesHome() {
  const navigate  = useNavigate();
  const token     = localStorage.getItem("token");
  const fullName  = localStorage.getItem("full_name") || "Sales Rep";
  const myUserId  = parseInt(localStorage.getItem("user_id") || "0");

  const [section,      setSection]      = useState("calendar");
  const [appointments, setAppointments] = useState([]);
  const [loading,      setLoading]      = useState(true);

  const today = new Date();
  const [calYear,       setCalYear]       = useState(today.getFullYear());
  const [calMonth,      setCalMonth]      = useState(today.getMonth());
  const [selectedDate,  setSelectedDate]  = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // ── Availability panel state ─────────────────────────────────────
  const [showAvail,  setShowAvail]  = useState(false);
  const [availDays,  setAvailDays]  = useState({ 0:false,1:false,2:false,3:false,4:false,5:false,6:false });
  const [availStart, setAvailStart] = useState("9:00 AM");
  const [availEnd,   setAvailEnd]   = useState("5:00 PM");
  const [availMsg,   setAvailMsg]   = useState("");
  const [saving,     setSaving]     = useState(false);

  // ── Booking state ───────────────────────────────────────────────────────
  const [clinics,        setClinics]        = useState([]);
  const [doctors,        setDoctors]        = useState([]);
  const [patients,       setPatients]       = useState([]);

  const [bookType,       setBookType]       = useState("consultation");
  const [bookClinic,     setBookClinic]     = useState("");
  const [bookDoctor,     setBookDoctor]     = useState("");
  const [bookPatient,    setBookPatient]    = useState("");
  const [bookReason,     setBookReason]     = useState("");
  const [bookDate,       setBookDate]       = useState("");
  const [bookTime,       setBookTime]       = useState("");
  const [bookDepartment, setBookDepartment] = useState("");
  const [bookRemark,     setBookRemark]     = useState("");
  const [bookDuration,   setBookDuration]   = useState(30);
  const [bookMsg,        setBookMsg]        = useState("");

  const [availSlots,   setAvailSlots]   = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [noSlotsMsg,   setNoSlotsMsg]   = useState("");

  const isSalesMeeting = bookType === SALES_MEETING_TYPE;

  useEffect(() => { if (!token) navigate("/"); }, [token, navigate]);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/meeting/sales/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAppointments(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);
  useEffect(() => {
    fetch(`${API}/api/clinics/`).then(r => r.json()).then(setClinics).catch(console.error);
  }, []);
  useEffect(() => {
    if (!bookClinic) { setDoctors([]); return; }
    fetch(`${API}/api/doctors/?clinic=${bookClinic}`).then(r => r.json()).then(setDoctors).catch(console.error);
  }, [bookClinic]);
  useEffect(() => {
    fetch(`${API}/api/users/patients/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setPatients).catch(console.error);
  }, [token]);

  // Reset slots when type changes
  useEffect(() => {
    setBookClinic(""); setBookDoctor("");
    setBookDate(""); setBookTime("");
    setAvailSlots([]); setNoSlotsMsg(""); setBookMsg("");
  }, [bookType]);

  // Doctor slots (consultation)
  useEffect(() => {
    if (isSalesMeeting) return;
    setAvailSlots([]); setBookTime(""); setNoSlotsMsg("");
    if (!bookDoctor || !bookDate) return;
    setSlotsLoading(true);
    const params = new URLSearchParams({ date: bookDate });
    if (bookClinic) params.set("clinic", bookClinic);
    fetch(`${API}/api/doctor/slots/${bookDoctor}/?${params}`)
      .then(r => r.json())
      .then(data => {
        const slots = data.slots || [];
        setAvailSlots(slots);
        if (!slots.length) setNoSlotsMsg("⚠ Doctor has no availability on this date.");
        else { setBookTime(""); setNoSlotsMsg(""); }
      })
      .catch(() => setNoSlotsMsg("⚠ Could not load availability."))
      .finally(() => setSlotsLoading(false));
  }, [bookDoctor, bookDate, bookClinic, isSalesMeeting]);

  // Own slots (sales meeting) — fetched from /api/sales/slots/<myUserId>/
  useEffect(() => {
    if (!isSalesMeeting) return;
    setAvailSlots([]); setBookTime(""); setNoSlotsMsg("");
    if (!bookDate || !myUserId) return;
    setSlotsLoading(true);
    fetch(`${API}/api/sales/slots/${myUserId}/?date=${bookDate}`)
      .then(r => r.json())
      .then(data => {
        const slots = data.slots || [];
        setAvailSlots(slots);
        if (!slots.length) {
          setNoSlotsMsg("⚠ You have no availability on this date. Please set your working hours first.");
        } else { setBookTime(""); setNoSlotsMsg(""); }
      })
      .catch(() => setNoSlotsMsg("⚠ Could not load your availability."))
      .finally(() => setSlotsLoading(false));
  }, [bookDate, isSalesMeeting, myUserId]);

  const handleLogout = () => { localStorage.clear(); navigate("/"); };

  const appointmentsOnDate = ds => appointments.filter(a => a.scheduled_time?.startsWith(ds));
  const todayAppointments  = appointments.filter(a => a.scheduled_time?.startsWith(todayStr()));
  const selectedAppts      = selectedDate ? appointmentsOnDate(selectedDate) : [];
  const selected           = selectedAppts[selectedIndex] || null;

  const handleJoin = async (appt) => {
    try {
      const res = await fetch(`${API}/api/meeting/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meeting_id: appt.meeting_id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Cannot join meeting"); return; }
      navigate(`/room/${data.room_id}?meeting_id=${data.meeting_id}&role=sales`);
    } catch (e) { alert("Error joining meeting"); }
  };

  // ── Set Availability ────────────────────────────────────────────────────
  const toggleDay = (idx) => setAvailDays(prev => ({ ...prev, [idx]: !prev[idx] }));
  const toggleAll = () => {
    const allOn = Object.values(availDays).every(Boolean);
    const next = {};
    for (let i = 0; i < 7; i++) next[i] = !allOn;
    setAvailDays(next);
  };

  const handleSetAvailability = async (e) => {
    e.preventDefault();
    setAvailMsg("");
    const selectedDays = Object.entries(availDays).filter(([, v]) => v).map(([k]) => parseInt(k));
    if (!selectedDays.length) { setAvailMsg("⚠ Please select at least one day."); return; }

    const start24 = to24h(availStart);
    const end24   = to24h(availEnd);
    if (start24 >= end24) { setAvailMsg("⚠ End time must be after start time."); return; }

    setSaving(true);
    try {
      const results = await Promise.all(
        selectedDays.map(day =>
          fetch(`${API}/api/sales/set-availability/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ day_of_week: day, start_time: start24, end_time: end24 }),
          })
        )
      );
      const allOk = results.every(r => r.ok);
      if (allOk) {
        setAvailMsg(`✅ Availability saved for ${selectedDays.length} day${selectedDays.length > 1 ? "s" : ""}!`);
        setTimeout(() => { setShowAvail(false); setAvailMsg(""); }, 2000);
      } else {
        const errData = await results.find(r => !r.ok)?.json();
        setAvailMsg(`⚠ ${errData?.error || "Some saves failed."}`);
      }
    } catch {
      setAvailMsg("⚠ Server error. Check if backend is running.");
    } finally {
      setSaving(false);
    }
  };

  // ── Book appointment ────────────────────────────────────────────────────
  const handleBook = async (e) => {
    e.preventDefault();
    setBookMsg("");

    if (isSalesMeeting) {
      if (!bookPatient || !bookDate || !bookTime) {
        setBookMsg("⚠ Please select a patient, date, and time.");
        return;
      }
    } else {
      if (!bookClinic || !bookDoctor || !bookPatient || !bookDate || !bookTime) {
        setBookMsg("⚠ Please fill all required fields.");
        return;
      }
    }
    if (noSlotsMsg) { setBookMsg("⚠ No available slots on selected date."); return; }

    try {
      const body = {
        patient_id        : parseInt(bookPatient),
        appointment_type  : bookType,
        appointment_reason: bookReason,
        scheduled_time    : `${bookDate}T${bookTime}:00`,
        duration          : parseInt(bookDuration),
        remark            : bookRemark,
        sales_id          : myUserId,
      };
      if (!isSalesMeeting) {
        body.clinic     = parseInt(bookClinic);
        body.doctor     = parseInt(bookDoctor);
        body.department = bookDepartment;
      }

      const res = await fetch(`${API}/api/book-appointment/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setBookMsg(`⚠ ${data.error || "Booking failed"}`); return; }

      setBookMsg(`✅ ${isSalesMeeting ? "Sales meeting" : "Appointment"} booked successfully!`);
      loadAppointments();
      setBookType("consultation");
      setBookClinic(""); setBookDoctor(""); setBookPatient(""); setBookReason("");
      setBookDate(""); setBookTime(""); setBookRemark(""); setBookDepartment("");
      setAvailSlots([]); setNoSlotsMsg("");
    } catch { setBookMsg("⚠ Server error"); }
  };

  // ── Calendar ────────────────────────────────────────────────────────────
  const renderCalendar = () => {
    const firstDay    = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return (
      <div style={styles.calendar}>
        <div style={styles.calHeader}>
          <button style={styles.calNavBtn} onClick={() => {
            if (calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);
          }}>‹</button>
          <span style={{fontWeight:700}}>{MONTHS[calMonth]} {calYear}</span>
          <button style={styles.calNavBtn} onClick={() => {
            if (calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);
          }}>›</button>
        </div>
        <div style={styles.calGrid}>
          {DAY_NAMES.map(d => <div key={d} style={styles.calDayLabel}>{d}</div>)}
          {cells.map((day, idx) => {
            if (!day) return <div key={`e${idx}`} style={styles.calEmpty} />;
            const ds    = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const appts = appointmentsOnDate(ds);
            const isTd  = ds === todayStr();
            return (
              <div key={ds}
                onClick={() => { if (appts.length) { setSelectedDate(ds); setSelectedIndex(0); } }}
                style={{
                  ...styles.calCell,
                  background: appts.length ? "rgba(245,158,11,0.2)" : "#1e293b",
                  border: isTd ? "2px solid #f59e0b" : "1px solid transparent",
                  cursor: appts.length ? "pointer" : "default",
                }}>
                <span style={{fontSize:"0.82rem",fontWeight:600}}>{day}</span>
                {appts.length > 0 && <span style={styles.apptDot}>{appts.length}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Appointment card ────────────────────────────────────────────────────
  const renderCard = () => {
    if (!selected) return null;
    const appt     = selected;
    const isEnded  = appt.status === "ended";
    const isSalesMtg = appt.appointment_type === SALES_MEETING_TYPE;
    const total    = selectedAppts.length;
    return (
      <div style={styles.overlay} onClick={() => { setSelectedDate(null); setSelectedIndex(0); }}>
        <div style={styles.card} onClick={e => e.stopPropagation()}>
          <button style={styles.cardClose} onClick={() => { setSelectedDate(null); setSelectedIndex(0); }}>✕</button>

          {total > 1 && (
            <div style={styles.cardNav}>
              <button style={styles.navBtn} disabled={selectedIndex===0} onClick={()=>setSelectedIndex(i=>i-1)}>‹ Prev</button>
              <span style={{color:"#94a3b8",fontSize:"0.85rem"}}>{selectedIndex+1} / {total}</span>
              <button style={styles.navBtn} disabled={selectedIndex===total-1} onClick={()=>setSelectedIndex(i=>i+1)}>Next ›</button>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <h3 style={{margin:0,fontSize:"1.15rem"}}>
              {isSalesMtg ? "💼 Sales Meeting" : "📋 Appointment Details"}
            </h3>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {isSalesMtg && (
                <span style={{background:"rgba(245,158,11,0.15)",color:"#f59e0b",
                  padding:"3px 10px",borderRadius:20,fontSize:"0.75rem",fontWeight:700}}>
                  SALES MEETING
                </span>
              )}
              {isEnded && <span style={styles.badgeEnded}>COMPLETED</span>}
            </div>
          </div>

          <div style={styles.cardGrid}>
            {[
              ["Patient",   appt.patient_name || "—"],
              isSalesMtg
                ? ["Sales Rep", appt.sales_name || fullName]
                : ["Doctor",    appt.doctor_name ? `Dr. ${appt.doctor_name}` : "—"],
              ["Type",      appt.appointment_type?.replace(/_/g, " ") || "—"],
              ["Clinic",    appt.clinic_name || (isSalesMtg ? "N/A" : "—")],
              ["Date",      appt.scheduled_time?.split("T")[0] || "—"],
              ["Time",      timeFrom(appt.scheduled_time)],
              ["Duration",  `${appt.duration} min`],
              ["Status",    appt.status_label || appt.status],
              ["Reason",    appt.appointment_reason || "—"],
              ["Remark",    appt.remark || "—"],
            ].map(([label, val]) => (
              <div key={label} style={styles.cardField}>
                <label style={styles.cardLabel}>{label}</label>
                <span style={styles.cardVal}>{val}</span>
              </div>
            ))}
          </div>

          {isEnded && (
            <div style={{marginTop:16,borderTop:"1px solid #334155",paddingTop:12}}>
              <p style={{fontSize:13,color:"#94a3b8",marginBottom:6}}>📝 Meeting Transcript</p>
              <div style={styles.transcript}>
                {appt.speech_to_text || <em style={{color:"#64748b"}}>No transcript recorded.</em>}
              </div>
            </div>
          )}

          {!isEnded && (
            <div style={{display:"flex",justifyContent:"center",marginTop:20}}>
              <button style={styles.btnJoin}
                onClick={() => { setSelectedDate(null); setSelectedIndex(0); handleJoin(appt); }}>
                📹 Join Meeting Room
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Time Grid Renderer (NEW) ────────────────────────────────────────────
  const renderTimeGrid = () => {
    // Generate all 15-minute interval slots for the day
    const allTimeSlots = [];
    for (let h = 0; h < 24; h++) {
      for (const m of ["00", "15", "30", "45"]) {
        const time24 = `${String(h).padStart(2, "0")}:${m}`;
        allTimeSlots.push(time24);
      }
    }
    
    return (
      <div style={{marginTop:8}}>
        <div style={styles.timeGrid}>
          {allTimeSlots.map(slot => {
            const isAvailable = availSlots.includes(slot);
            const isSelected = bookTime === slot;
            return (
              <button
                key={slot}
                type="button"
                disabled={!isAvailable}
                onClick={() => setBookTime(slot)}
                style={{
                  ...styles.timeSlot,
                  background: isSelected 
                    ? "linear-gradient(135deg,#d97706,#fbbf24)" 
                    : isAvailable 
                      ? "#1e293b" 
                      : "#0f172a",
                  color: isSelected 
                    ? "#0f172a" 
                    : isAvailable 
                      ? "#f8fafc" 
                      : "#475569",
                  border: isSelected 
                    ? "2px solid #f59e0b" 
                    : isAvailable 
                      ? "1px solid #475569" 
                      : "1px solid #1e293b",
                  cursor: isAvailable ? "pointer" : "not-allowed",
                  fontWeight: isSelected ? 700 : 600,
                  opacity: isAvailable ? 1 : 0.4,
                }}
              >
                {to12h(slot)}
              </button>
            );
          })}
        </div>
        {bookTime && (
          <p style={{fontSize:13,color:"#4ade80",marginTop:10,marginBottom:0}}>
            ✓ Selected: {to12h(bookTime)}
          </p>
        )}
      </div>
    );
  };

  return (
    <div style={styles.root}>

      {/* ── Top bar ── */}
      <div style={styles.topbar}>
        <h2 style={{margin:0,fontSize:"1.4rem"}}>💼 Sales Dashboard</h2>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:8}}>
            {["calendar","book","today"].map(s => (
              <button key={s} style={{
                ...styles.navTabBtn,
                background: section===s ? "rgba(245,158,11,0.2)" : "transparent",
                color: section===s ? "#f59e0b" : "#94a3b8",
                borderColor: section===s ? "#f59e0b" : "#334155",
              }} onClick={() => setSection(s)}>
                {s === "calendar" ? "📅 Calendar" : s === "book" ? "📝 Book" : "📹 Today"}
              </button>
            ))}
          </div>
          <button
            style={{
              ...styles.navTabBtn,
              background: showAvail ? "rgba(245,158,11,0.25)" : "transparent",
              color: showAvail ? "#f59e0b" : "#94a3b8",
              borderColor: showAvail ? "#f59e0b" : "#334155",
            }}
            onClick={() => { setShowAvail(v => !v); setAvailMsg(""); }}>
            {showAvail ? "✕ Close" : "⏰ Set Availability"}
          </button>
          <span style={styles.namePill}>👤 {fullName}</span>
          <button style={styles.btnLogout} onClick={handleLogout}>🚪 Logout</button>
        </div>
      </div>

      {/* ── Availability panel ── */}
      {showAvail && (
        <div style={styles.availPanel}>
          <h3 style={{margin:"0 0 20px",fontSize:"1rem",color:"#f59e0b",fontWeight:700}}>
            ⏰ Set Your Working Hours for Sales Meetings
          </h3>
          <p style={{fontSize:"0.82rem",color:"#64748b",marginTop:-12,marginBottom:18}}>
            These hours define when patients can book sales meetings with you.
          </p>
          <form onSubmit={handleSetAvailability} style={{display:"flex",flexDirection:"column",gap:18,maxWidth:700}}>

            <div style={{display:"flex",alignItems:"flex-start",gap:20}}>
              <span style={styles.availLabel}>Days *</span>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                <label style={{
                  ...styles.dayPill,
                  background: Object.values(availDays).every(Boolean) ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.07)",
                  borderColor: Object.values(availDays).every(Boolean) ? "#f59e0b" : "rgba(245,158,11,0.3)",
                  color: Object.values(availDays).every(Boolean) ? "#f59e0b" : "#94a3b8",
                }}>
                  <input type="checkbox" style={{display:"none"}}
                    checked={Object.values(availDays).every(Boolean)} onChange={toggleAll} />
                  All Days
                </label>
                {WEEK_DAYS.map((day, i) => (
                  <label key={i} style={{
                    ...styles.dayPill,
                    background: availDays[i] ? "rgba(245,158,11,0.2)" : "#1e293b",
                    borderColor: availDays[i] ? "#f59e0b" : "#334155",
                    color: availDays[i] ? "#f59e0b" : "#64748b",
                    fontWeight: availDays[i] ? 700 : 600,
                  }}>
                    <input type="checkbox" style={{display:"none"}}
                      checked={!!availDays[i]} onChange={() => toggleDay(i)} />
                    {day.slice(0, 3)}
                  </label>
                ))}
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:20}}>
              <span style={styles.availLabel}>From *</span>
              <select value={availStart} onChange={e => setAvailStart(e.target.value)} style={styles.availSelect}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:20}}>
              <span style={styles.availLabel}>Until *</span>
              <select value={availEnd} onChange={e => setAvailEnd(e.target.value)} style={styles.availSelect}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <button type="submit" disabled={saving} style={{
                padding:"10px 24px",
                background:"linear-gradient(135deg,#d97706,#fbbf24)",
                border:"none", borderRadius:8, color:"#0f172a",
                fontWeight:700, fontSize:"0.9rem", cursor:"pointer",
                opacity: saving ? 0.6 : 1,
              }}>
                {saving ? "Saving…" : "💾 Save Availability"}
              </button>
              {availMsg && <span style={{
                fontSize:"0.88rem",
                color: availMsg.startsWith("✅") ? "#4ade80" : "#f87171",
              }}>{availMsg}</span>}
            </div>
          </form>
        </div>
      )}

      <div style={{padding:"28px 32px"}}>

        {/* ── CALENDAR section ── */}
        {section === "calendar" && (
          <div style={{display:"flex",gap:32,flexWrap:"wrap"}}>
            <div style={{flex:"0 0 auto",minWidth:320}}>
              <h3 style={styles.sectionTitle}>📅 My Meetings Calendar</h3>
              <p style={styles.hint}>Click on highlighted dates to see meeting details.</p>
              {renderCalendar()}
            </div>
            <div style={{flex:1,minWidth:320}}>
              <h3 style={styles.sectionTitle}>📋 All Upcoming Meetings</h3>
              {loading ? <p style={{color:"#64748b",fontStyle:"italic"}}>Loading…</p>
              : appointments.filter(a => a.status !== "ended").length === 0
                ? <p style={{color:"#64748b",fontStyle:"italic"}}>No upcoming meetings.</p>
                : appointments
                    .filter(a => a.status !== "ended")
                    .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time))
                    .map(appt => {
                      const isSalesMtg = appt.appointment_type === SALES_MEETING_TYPE;
                      return (
                        <div key={appt.meeting_id} style={{...styles.meetingRow,cursor:"pointer"}}
                          onClick={() => { setSelectedDate(appt.scheduled_time?.split("T")[0]); setSelectedIndex(0); }}>
                          <div>
                            <div style={{fontWeight:600,fontSize:"0.95rem"}}>
                              {appt.scheduled_time?.split("T")[0]} {timeFrom(appt.scheduled_time)}
                              {isSalesMtg && (
                                <span style={{marginLeft:8,fontSize:"0.75rem",color:"#f59e0b",fontWeight:700}}>
                                  💼 Sales Meeting
                                </span>
                              )}
                            </div>
                            <div style={{color:"#94a3b8",fontSize:"0.85rem",marginTop:3}}>
                              {isSalesMtg
                                ? `Patient: ${appt.patient_name}`
                                : `Dr. ${appt.doctor_name} · ${appt.patient_name}`}
                            </div>
                          </div>
                          <span style={{
                            background: appt.status==="started" ? "rgba(52,168,83,0.2)" : "rgba(59,130,246,0.15)",
                            color: appt.status==="started" ? "#4ade80" : "#60a5fa",
                            padding:"3px 10px",borderRadius:20,fontSize:"0.78rem",fontWeight:700,
                          }}>{appt.status_label || appt.status}</span>
                        </div>
                      );
                    })
              }
            </div>
          </div>
        )}

        {/* ── BOOK section ── */}
        {section === "book" && (
          <div style={{maxWidth:700}}>
            <h2 style={{color:"#f8fafc",marginBottom:20}}>📝 Book for Patient</h2>
            <form onSubmit={handleBook} style={styles.bookForm}>

              <label style={styles.bookLabel}>Appointment Type *</label>
              <select style={styles.bookInput} value={bookType} onChange={e => setBookType(e.target.value)}>
                <option value="consultation">Consultation</option>
                <option value="sales_meeting">Sales Meeting</option>
              </select>

              {isSalesMeeting && (
                <div style={{
                  background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)",
                  borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", color:"#f59e0b", marginTop:4,
                }}>
                  💼 Sales Meeting — You will host. No clinic or doctor needed.
                  {!showAvail && (
                    <span style={{marginLeft:8,fontSize:"0.8rem",color:"#94a3b8"}}>
                      (Set your availability above if you haven't yet.)
                    </span>
                  )}
                </div>
              )}

              {!isSalesMeeting && (
                <>
                  <label style={styles.bookLabel}>Select Clinic *</label>
                  <select style={styles.bookInput} value={bookClinic}
                    onChange={e => { setBookClinic(e.target.value); setBookDoctor(""); }} required>
                    <option value="">— Choose clinic —</option>
                    {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>

                  <label style={styles.bookLabel}>Select Doctor *</label>
                  <select style={styles.bookInput} value={bookDoctor}
                    onChange={e => setBookDoctor(e.target.value)} disabled={!bookClinic} required>
                    <option value="">— Choose doctor —</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.full_name}{d.department ? ` (${d.department})` : ""}</option>)}
                  </select>

                  <label style={styles.bookLabel}>Department</label>
                  <input style={styles.bookInput} type="text" placeholder="e.g. Cardiology"
                    value={bookDepartment} onChange={e => setBookDepartment(e.target.value)} />
                </>
              )}

              <label style={styles.bookLabel}>Select Patient *</label>
              <select style={styles.bookInput} value={bookPatient}
                onChange={e => setBookPatient(e.target.value)} required>
                <option value="">— Choose patient —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name || p.username}</option>)}
              </select>

              <label style={styles.bookLabel}>Appointment Reason</label>
              <input style={styles.bookInput} type="text"
                placeholder={isSalesMeeting ? "e.g. Product walkthrough, follow-up" : "e.g. Consultation"}
                value={bookReason} onChange={e => setBookReason(e.target.value)} />

              <label style={styles.bookLabel}>Date *</label>
              <input style={styles.bookInput} type="date" value={bookDate} min={todayStr()}
                onChange={e => setBookDate(e.target.value)} required />

              <label style={styles.bookLabel}>
                Time *{slotsLoading && <span style={{fontWeight:400,color:"#64748b"}}> Loading…</span>}
              </label>
              {(() => {
                const needsInput = isSalesMeeting ? !bookDate : (!bookDoctor || !bookDate);
                if (needsInput) return (
                  <p style={{fontSize:13,color:"#64748b",margin:"0 0 4px",fontStyle:"italic"}}>
                    {isSalesMeeting
                      ? "Select a date to see your available slots."
                      : "Select doctor and date first."}
                  </p>
                );
                if (slotsLoading) return <p style={{fontSize:13,color:"#94a3b8",margin:"0 0 4px"}}>Checking availability…</p>;
                if (noSlotsMsg)   return <p style={{fontSize:13,color:"#f87171",margin:"0 0 4px"}}>{noSlotsMsg}</p>;
                return renderTimeGrid();
              })()}

              <label style={styles.bookLabel}>Duration</label>
              <select style={styles.bookInput} value={bookDuration} onChange={e => setBookDuration(e.target.value)}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
              </select>

              <label style={styles.bookLabel}>Remark</label>
              <textarea style={{...styles.bookInput,resize:"vertical",minHeight:70}}
                placeholder="Any notes…" value={bookRemark}
                onChange={e => setBookRemark(e.target.value)} rows={3} />

              <button type="submit"
                style={{...styles.btnBook, opacity:(noSlotsMsg||slotsLoading||!bookTime)?0.5:1}}
                disabled={!!noSlotsMsg || slotsLoading || !bookTime}>
                ✅ Confirm Booking
              </button>
              {bookMsg && (
                <p style={{color:bookMsg.startsWith("✅")?"#4ade80":"#f87171",marginTop:8,fontSize:"0.9rem"}}>
                  {bookMsg}
                </p>
              )}
            </form>
          </div>
        )}

        {/* ── TODAY section ── */}
        {section === "today" && (
          <div>
            <h2 style={{color:"#f8fafc",marginBottom:4}}>📹 Today's Meetings</h2>
            <p style={styles.hint}>{todayStr()}</p>
            {loading ? <p style={{color:"#64748b",fontStyle:"italic"}}>Loading…</p>
            : todayAppointments.length === 0
              ? <p style={{color:"#64748b",fontStyle:"italic"}}>No meetings today.</p>
              : todayAppointments.map(appt => {
                  const isSalesMtg = appt.appointment_type === SALES_MEETING_TYPE;
                  return (
                    <div key={appt.meeting_id} style={styles.meetingRow}>
                      <div>
                        <div style={{fontWeight:700,fontSize:"1rem"}}>
                          {timeFrom(appt.scheduled_time)}
                          {isSalesMtg ? " — 💼 Sales Meeting" : ` — ${appt.meeting_type_label || appt.meeting_type}`}
                        </div>
                        <div style={{color:"#94a3b8",fontSize:"0.88rem",marginTop:4}}>
                          {isSalesMtg
                            ? `Patient: ${appt.patient_name}`
                            : `Dr. ${appt.doctor_name} · ${appt.patient_name} · ${appt.clinic_name}`}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        {appt.status === "ended"
                          ? <span style={styles.badgeEnded}>Ended</span>
                          : <button style={styles.btnJoin} onClick={() => handleJoin(appt)}>📹 Join</button>
                        }
                      </div>
                    </div>
                  );
                })
            }
          </div>
        )}
      </div>

      {selected && renderCard()}
    </div>
  );
}

const styles = {
  root: { minHeight:"100vh", background:"linear-gradient(135deg,#0f172a,#020617)", color:"#f8fafc", fontFamily:"'Segoe UI',Tahoma,Geneva,Verdana,sans-serif" },
  topbar: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 32px", background:"rgba(30,41,59,0.97)", borderBottom:"1px solid #334155", position:"sticky", top:0, zIndex:10, flexWrap:"wrap", gap:12 },
  namePill: { fontSize:"0.85rem", color:"#94a3b8", background:"#1e293b", padding:"6px 14px", borderRadius:20, border:"1px solid #334155" },
  navTabBtn: { background:"transparent", border:"1px solid #334155", color:"#94a3b8", padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:"0.85rem", fontWeight:600, transition:"all 0.15s" },
  btnLogout: { background:"#ef4444", color:"white", border:"none", padding:"9px 18px", borderRadius:8, fontWeight:600, cursor:"pointer" },
  sectionTitle: { fontSize:"1rem", color:"#f59e0b", marginBottom:6, marginTop:0 },
  hint: { color:"#64748b", fontSize:"0.85rem", marginBottom:16 },
  availPanel: { background:"rgba(15,23,42,0.98)", borderBottom:"1px solid #334155", padding:"24px 32px" },
  availLabel: { minWidth:70, paddingTop:10, fontSize:"0.78rem", fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", flexShrink:0 },
  availSelect: { padding:"10px 14px", borderRadius:8, border:"1px solid #475569", background:"#1e293b", color:"#f8fafc", fontSize:14, minWidth:180, outline:"none" },
  dayPill: { display:"inline-flex", alignItems:"center", justifyContent:"center", minWidth:50, padding:"7px 12px", borderRadius:8, cursor:"pointer", fontSize:"0.81rem", fontWeight:600, userSelect:"none", border:"1.5px solid", transition:"all 0.15s" },
  calendar: { background:"rgba(30,41,59,0.8)", borderRadius:16, padding:24, border:"1px solid #334155", maxWidth:360 },
  calHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, fontSize:"1.05rem" },
  calNavBtn: { background:"none", border:"none", color:"#94a3b8", fontSize:"1.2rem", cursor:"pointer", padding:"4px 10px", borderRadius:6 },
  calGrid: { display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:5 },
  calDayLabel: { textAlign:"center", fontSize:"0.72rem", color:"#64748b", fontWeight:600, paddingBottom:4 },
  calEmpty: { aspectRatio:1 },
  calCell: { aspectRatio:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", borderRadius:8, position:"relative", transition:"all 0.15s" },
  apptDot: { background:"#f59e0b", color:"#0f172a", fontSize:"0.6rem", fontWeight:700, borderRadius:"50%", width:15, height:15, display:"flex", alignItems:"center", justifyContent:"center", position:"absolute", top:2, right:2 },
  meetingRow: { display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(30,41,59,0.8)", border:"1px solid #334155", borderRadius:10, padding:"14px 18px", marginBottom:10 },
  cardNav: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, padding:"8px 0", borderBottom:"1px solid #334155" },
  navBtn: { background:"#334155", color:"#f8fafc", border:"none", padding:"5px 14px", borderRadius:6, cursor:"pointer", fontSize:"0.85rem" },
  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
  card: { background:"#1e293b", borderRadius:16, padding:32, maxWidth:580, width:"100%", border:"1px solid #334155", position:"relative", maxHeight:"90vh", overflowY:"auto" },
  cardClose: { position:"absolute", top:14, right:14, background:"none", border:"none", color:"#94a3b8", fontSize:"1.1rem", cursor:"pointer" },
  cardGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 },
  cardField: { background:"#0f172a", borderRadius:8, padding:"10px 14px" },
  cardLabel: { display:"block", fontSize:"0.7rem", color:"#64748b", fontWeight:600, textTransform:"uppercase", marginBottom:3 },
  cardVal: { fontSize:"0.9rem", color:"#f1f5f9" },
  transcript: { background:"#0f172a", border:"1px solid #334155", borderRadius:8, padding:12, fontSize:13, color:"#cbd5e1", whiteSpace:"pre-wrap", fontFamily:"monospace", maxHeight:140, overflowY:"auto" },
  badgeEnded: { background:"#334155", color:"#94a3b8", padding:"3px 10px", borderRadius:20, fontSize:"0.75rem", fontWeight:700 },
  btnJoin: { background:"linear-gradient(135deg,#d97706,#fbbf24)", color:"#0f172a", border:"none", borderRadius:8, padding:"11px 22px", fontWeight:700, fontSize:"0.9rem", cursor:"pointer" },
  bookForm: { background:"rgba(30,41,59,0.8)", borderRadius:16, padding:28, border:"1px solid #334155", display:"flex", flexDirection:"column", gap:6 },
  bookLabel: { fontSize:"0.85rem", color:"#94a3b8", fontWeight:600, marginTop:8 },
  bookInput: { padding:"11px 14px", borderRadius:8, border:"1px solid #475569", background:"#0f172a", color:"#f8fafc", fontSize:14, width:"100%", boxSizing:"border-box" },
  btnBook: { marginTop:16, padding:14, background:"linear-gradient(135deg,#d97706,#fbbf24)", border:"none", borderRadius:10, color:"#0f172a", fontSize:16, fontWeight:700, cursor:"pointer" },
  // NEW: Time grid styles
  timeGrid: { 
    display:"grid", 
    gridTemplateColumns:"repeat(auto-fill, minmax(90px, 1fr))", 
    gap:8, 
    maxHeight:400, 
    overflowY:"auto",
    padding:4,
  },
  timeSlot: {
    padding:"10px 8px",
    borderRadius:6,
    fontSize:"0.82rem",
    transition:"all 0.15s",
    border:"1px solid",
  },
};