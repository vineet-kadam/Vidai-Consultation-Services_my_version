// src/components/DoctorHome.js -- FIXED
// Bug fixes:
//  1. Pass role=doctor as URL param when navigating to meeting room (fixes naming bug)
//  2. avail-form-v2 CSS class matches updated DoctorHome.css
//  3. Set Availability correctly submits with proper clinic + day + time

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./DoctorHome.css";

const API       = "http://192.168.10.191:8000";
const MONTHS    = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WEEK_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const toDateStr = d => d.toISOString().split("T")[0];

// Convert "HH:MM" 24h → "h:MM AM/PM"
const to12h = (time24) => {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${ampm}`;
};

// Convert "h:MM AM/PM" → "HH:MM"
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

// Convert "YYYY-MM-DDTHH:MM:SS" → "h:MM AM/PM"
const timeFrom = (dt) => {
  if (!dt) return "";
  return to12h(dt.split("T")[1]?.slice(0, 5));
};

export default function DoctorHome() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  // Calendar
  const today = new Date();
  const [calYear,      setCalYear]      = useState(today.getFullYear());
  const [calMonth,     setCalMonth]     = useState(today.getMonth());
  const [appointments, setAppointments] = useState([]);
  const [clinics,      setClinics]      = useState([]);
  const [filterClinic, setFilterClinic] = useState("");
  const [selectedDate, setSelectedDate]   = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Availability
  const [showAvail,   setShowAvail]   = useState(false);
  const [availDays,   setAvailDays]   = useState({ 0:false,1:false,2:false,3:false,4:false,5:false,6:false });
  const [availClinic, setAvailClinic] = useState("");
  const [availStart,  setAvailStart]  = useState("9:00 AM");
  const [availEnd,    setAvailEnd]    = useState("5:00 PM");
  const [availMsg,    setAvailMsg]    = useState("");
  const [saving,      setSaving]      = useState(false);

  useEffect(() => { if (!token) navigate("/"); }, [token, navigate]);

  const loadAppointments = useCallback(async () => {
    const url = filterClinic
      ? `${API}/api/doctor/appointments/?clinic=${filterClinic}`
      : `${API}/api/doctor/appointments/`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setAppointments(await r.json());
    } catch (e) { console.error(e); }
  }, [token, filterClinic]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);
  useEffect(() => {
    fetch(`${API}/api/clinics/`).then(r => r.json()).then(setClinics).catch(console.error);
  }, []);

  // Calendar helpers
  const appointmentsOnDate = ds => appointments.filter(a => a.scheduled_time?.startsWith(ds));
  const selectedAppts = selectedDate ? appointmentsOnDate(selectedDate) : [];
  const selected = selectedAppts[selectedIndex] || null;

  const openCard  = (ds) => { setSelectedDate(ds); setSelectedIndex(0); };
  const closeCard = () => { setSelectedDate(null); setSelectedIndex(0); };

  const renderCalendar = () => {
    const firstDay    = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return (
      <div className="calendar">
        <div className="cal-header">
          <button onClick={() => calMonth === 0 ? (setCalMonth(11), setCalYear(y => y-1)) : setCalMonth(m => m-1)}>‹</button>
          <span>{MONTHS[calMonth]} {calYear}</span>
          <button onClick={() => calMonth === 11 ? (setCalMonth(0), setCalYear(y => y+1)) : setCalMonth(m => m+1)}>›</button>
        </div>
        <div className="cal-grid">
          {DAY_NAMES.map(d => <div key={d} className="cal-day-label">{d}</div>)}
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="cal-cell empty" />;
            const ds    = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const appts = appointmentsOnDate(ds);
            const isTd  = ds === toDateStr(new Date());
            return (
              <div key={ds}
                className={`cal-cell ${isTd ? "today" : ""} ${appts.length ? "has-appt" : ""}`}
                onClick={() => appts.length && openCard(ds)}>
                <span className="day-num">{day}</span>
                {appts.length > 0 && <span className="appt-dot">{appts.length}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Start appointment — FIX: pass role=doctor in URL
  const handleStartAppt = async (appt) => {
    try {
      const res = await fetch(`${API}/api/meeting/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meeting_id: appt.meeting_id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Cannot start appointment"); return; }
      // Pass role=doctor so MeetingRoom shows correct name/role
      navigate(`/room/${data.room_id}?meeting_id=${data.meeting_id}&role=doctor`);
    } catch (e) {
      alert("Error starting appointment: " + e.message);
    }
  };

  // Appointment card
  const renderCard = () => {
    if (!selected) return null;
    const appt    = selected;
    const pp      = appt.participants?.find(p => p.role === "patient") || {};
    const isEnded = appt.status === "ended";
    const total   = selectedAppts.length;

    return (
      <div className="appt-card-overlay" onClick={closeCard}>
        <div className="appt-card" onClick={e => e.stopPropagation()}>
          <button className="card-close" onClick={closeCard}>✕</button>

          {total > 1 && (
            <div className="card-nav">
              <button disabled={selectedIndex === 0} onClick={() => setSelectedIndex(i => i-1)}>‹</button>
              <span>Appointment {selectedIndex+1} of {total}</span>
              <button disabled={selectedIndex === total-1} onClick={() => setSelectedIndex(i => i+1)}>›</button>
            </div>
          )}

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <h3>🩺 Appointment Details</h3>
            {isEnded && <span className="badge-ended">COMPLETED</span>}
          </div>
          <div className="card-grid">
            <div className="card-field"><label>1. First Name</label>    <span>{appt.patient_name?.split(" ")[0] || "—"}</span></div>
            <div className="card-field"><label>2. Last Name</label>     <span>{appt.patient_name?.split(" ").slice(1).join(" ") || "—"}</span></div>
            <div className="card-field"><label>3. Sex at Birth</label>  <span>{pp.sex || "—"}</span></div>
            <div className="card-field"><label>4. Mobile No.</label>    <span>{pp.mobile || "—"}</span></div>
            <div className="card-field"><label>5. Date of Birth</label> <span>{pp.dob || "—"}</span></div>
            <div className="card-field"><label>6. Email ID</label>      <span>{pp.email || "—"}</span></div>
            <div className="card-field"><label>7. Department</label>    <span>{appt.department || "—"}</span></div>
            <div className="card-field"><label>8. Doctor</label>        <span>Dr. {appt.doctor_name}</span></div>
            <div className="card-field"><label>9. Reason</label>        <span>{appt.appointment_reason || "—"}</span></div>
            <div className="card-field"><label>10. Date</label>         <span>{appt.scheduled_time?.split("T")[0] || "—"}</span></div>
            <div className="card-field"><label>11. Time</label>         <span>{timeFrom(appt.scheduled_time)}</span></div>
            <div className="card-field"><label>12. Remark</label>       <span>{appt.remark || "—"}</span></div>
          </div>
          {isEnded ? (
            <div style={{ marginTop:15, borderTop:"1px solid #334155", paddingTop:12 }}>
              <h4 style={{ margin:"0 0 8px", fontSize:13, color:"#94a3b8" }}>📝 Consultation Notes / Transcript</h4>
              <div className="transcript-box">
                {appt.speech_to_text || <em style={{ color:"#475569" }}>No notes recorded for this session.</em>}
              </div>
            </div>
          ) : (
            <div className="card-start-row">
              <button className="btn-start-green" onClick={() => handleStartAppt(appt)}>
                📹 Start Appointment
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Availability
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
    if (!availClinic)          { setAvailMsg("⚠ Please select a clinic."); return; }

    const start24 = to24h(availStart);
    const end24   = to24h(availEnd);
    if (start24 >= end24) { setAvailMsg("⚠ End time must be after start time."); return; }

    setSaving(true);
    try {
      const results = await Promise.all(
        selectedDays.map(day =>
          fetch(`${API}/api/doctor/set-availability/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              clinic: parseInt(availClinic),
              day_of_week: day,
              start_time: start24,
              end_time: end24,
            }),
          })
        )
      );
      const allOk = results.every(r => r.ok);
      if (allOk) {
        setAvailMsg(`✅ Availability saved for ${selectedDays.length} day${selectedDays.length > 1 ? "s" : ""}!`);
        setTimeout(() => { setShowAvail(false); setAvailMsg(""); }, 2000);
      } else {
        const errData = await results.find(r => !r.ok)?.json();
        setAvailMsg(`⚠ ${errData?.error || "Some saves failed. Check clinic/day settings."}`);
      }
    } catch (err) {
      setAvailMsg("⚠ Server error. Check if backend is running.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => { localStorage.clear(); navigate("/"); };

  // 30-min interval time options
  const timeOptions = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ["00", "30"]) {
      const ampm = h < 12 ? "AM" : "PM";
      const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
      timeOptions.push(`${h12}:${m} ${ampm}`);
    }
  }

  return (
    <div className="doctor-container">

      <div className="doctor-topbar">
        <h2>🩺 Doctor Console</h2>
        <div className="topbar-actions">
          <button
            className={`btn ${showAvail ? "warning" : "secondary"}`}
            onClick={() => { setShowAvail(v => !v); setAvailMsg(""); }}>
            {showAvail ? "✕ Close" : "📅 Set Availability"}
          </button>
          <button className="btn danger-sm" onClick={handleLogout}>🚪 Logout</button>
        </div>
      </div>

      {/* ── Availability panel ── */}
      {showAvail && (
        <div className="avail-panel">
          <h3>⏰ Set Your Working Hours</h3>
          <form onSubmit={handleSetAvailability} className="avail-form-v2">

            <div className="avail-row">
              <span className="avail-label">Clinic *</span>
              <select value={availClinic} onChange={e => setAvailClinic(e.target.value)} required>
                <option value="">— Select Clinic —</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="avail-row">
              <span className="avail-label">Days *</span>
              <div className="avail-days">
                <label className="avail-day-all">
                  <input type="checkbox"
                    checked={Object.values(availDays).every(Boolean)}
                    onChange={toggleAll} />
                  <span>All Days</span>
                </label>
                {WEEK_DAYS.map((day, i) => (
                  <label key={i} className={`avail-day-pill ${availDays[i] ? "selected" : ""}`}>
                    <input type="checkbox" checked={!!availDays[i]} onChange={() => toggleDay(i)} />
                    <span>{day.slice(0, 3)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="avail-row">
              <span className="avail-label">From *</span>
              <select value={availStart} onChange={e => setAvailStart(e.target.value)}>
                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="avail-row">
              <span className="avail-label">Until *</span>
              <select value={availEnd} onChange={e => setAvailEnd(e.target.value)}>
                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="avail-row">
              <span className="avail-label" />
              <button type="submit" className="btn primary" disabled={saving} style={{ marginTop: 4 }}>
                {saving ? "Saving…" : "💾 Save Availability"}
              </button>
            </div>
          </form>
          {availMsg && <p className="avail-msg">{availMsg}</p>}
        </div>
      )}

      <div className="cal-view">
        <div className="cal-toolbar">
          <span className="cal-title">📅 My Appointments</span>
          <select value={filterClinic} onChange={e => setFilterClinic(e.target.value)} className="clinic-filter">
            <option value="">All Clinics</option>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {renderCalendar()}

        <div className="upcoming-list">
          <h3>Upcoming ({appointments.length})</h3>
          {!appointments.length && <p className="empty">No appointments found.</p>}
          {appointments.slice(0, 10).map(a => (
            <div key={a.meeting_id} className="upcoming-row" onClick={() => {
              setSelectedDate(a.scheduled_time?.split("T")[0]);
              setSelectedIndex(0);
            }}>
              <span className="urow-time">{a.scheduled_time?.split("T")[0]} {timeFrom(a.scheduled_time)}</span>
              <span className="urow-patient">👤 {a.patient_name}</span>
              <span className="urow-reason">{a.appointment_reason || "—"}</span>
              <span className="urow-clinic">{a.clinic_name}</span>
              {a.status === "ended" && <span className="badge-ended-sm">Ended</span>}
            </div>
          ))}
        </div>
      </div>

      {selected && renderCard()}
    </div>
  );
}