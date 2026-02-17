// src/components/PatientHome.js
//
// Full patient dashboard with three sections:
//   1. Calendar    — shows upcoming appointments; click to see details card
//   2. Book        — book a new appointment (clinic → type → doctor → details)
//   3. Join        — shows today's appointments with "Start" button

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./PatientHome.css";

const API = "http://localhost:8000";

// ─── Helper: format date as YYYY-MM-DD (local) ────────────────────────────
const toDateStr = (d) => d.toISOString().split("T")[0];
const todayStr  = () => toDateStr(new Date());

// ─── Helper: get day name for a date ───────────────────────────────────────
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS    = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];

export default function PatientHome() {
  const navigate  = useNavigate();
  const token     = localStorage.getItem("token");
  const fullName  = localStorage.getItem("full_name") || "Patient";

  // ── Section shown: "calendar" | "book" | "join" ───────────────────────────
  const [section, setSection] = useState("calendar");

  // ── All appointments from backend ─────────────────────────────────────────
  const [appointments, setAppointments] = useState([]);

  // ── Calendar state ────────────────────────────────────────────────────────
  const today        = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(null); // selected appointment object

  // ── Doctor availability for selected appointment ───────────────────────────
  const [doctorAvailable, setDoctorAvailable] = useState(null);

  // ── Booking form state ────────────────────────────────────────────────────
  const [clinics,          setClinics]          = useState([]);
  const [doctors,          setDoctors]          = useState([]);
  const [bookClinic,       setBookClinic]       = useState("");
  const [bookDoctor,       setBookDoctor]       = useState("");
  const [bookType,         setBookType]         = useState("consultation");
  const [bookReason,       setBookReason]       = useState("");
  const [bookDate,         setBookDate]         = useState("");
  const [bookTime,         setBookTime]         = useState("");
  const [bookDepartment,   setBookDepartment]   = useState("");
  const [bookRemark,       setBookRemark]       = useState("");
  const [bookDuration,     setBookDuration]     = useState(30);
  const [bookMsg,          setBookMsg]          = useState("");

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  // ── Load appointments on mount ────────────────────────────────────────────
  const loadAppointments = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/patient/appointments/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAppointments(await res.json());
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);

  // ── Load clinics ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/clinics/`)
      .then(r => r.json()).then(setClinics).catch(console.error);
  }, []);

  // ── Load doctors when clinic changes (booking form) ───────────────────────
  useEffect(() => {
    if (!bookClinic) { setDoctors([]); return; }
    fetch(`${API}/api/doctors/?clinic=${bookClinic}`)
      .then(r => r.json()).then(setDoctors).catch(console.error);
  }, [bookClinic]);

  // ── Check doctor availability when appointment selected ───────────────────
  useEffect(() => {
    if (!selected?.doctor) { setDoctorAvailable(null); return; }
    fetch(`${API}/api/doctor/available/${selected.doctor}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setDoctorAvailable(d.available))
      .catch(() => setDoctorAvailable(false));
  }, [selected, token]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  // Filter appointments by a specific date string (YYYY-MM-DD)
  const appointmentsOnDate = (dateStr) =>
    appointments.filter(a => a.scheduled_time?.startsWith(dateStr));

  // Today's appointments (for the "Join" section)
  const todayAppointments = appointments.filter(a =>
    a.scheduled_time?.startsWith(todayStr())
  );

  // ── Calendar rendering ────────────────────────────────────────────────────

  const renderCalendar = () => {
    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];

    // Empty cells before the 1st
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    return (
      <div className="calendar">
        {/* Month navigation */}
        <div className="cal-header">
          <button onClick={() => {
            if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
            else setCalMonth(m => m - 1);
          }}>◀</button>
          <span>{MONTHS[calMonth]} {calYear}</span>
          <button onClick={() => {
            if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
            else setCalMonth(m => m + 1);
          }}>▶</button>
        </div>

        {/* Day labels */}
        <div className="cal-grid">
          {DAY_NAMES.map(d => (
            <div key={d} className="cal-day-label">{d}</div>
          ))}

          {/* Day cells */}
          {cells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="cal-cell empty" />;

            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const appts   = appointmentsOnDate(dateStr);
            const isToday = dateStr === todayStr();

            return (
              <div
                key={dateStr}
                className={`cal-cell ${isToday ? "today" : ""} ${appts.length > 0 ? "has-appt" : ""}`}
                onClick={() => appts.length > 0 && setSelected(appts[0])}
              >
                <span className="day-num">{day}</span>
                {appts.length > 0 && (
                  <span className="appt-dot">{appts.length}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Appointment card (13 fields) ──────────────────────────────────────────

  const renderAppointmentCard = (appt) => {
    // Build patient profile fields from participants JSON
    const patientParticipant = appt.participants?.find(p => p.role === "patient") || {};

    const handleStart = async () => {
      if (!doctorAvailable) return;
      try {
        const res = await fetch(`${API}/api/meeting/start/`, {
          method : "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body   : JSON.stringify({ meeting_id: appt.meeting_id }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || "Cannot start appointment");
          return;
        }
        navigate(`/patient/${data.room_id}?meeting_id=${data.meeting_id}`);
      } catch (e) { alert("Error starting appointment"); }
    };

    return (
      <div className="appt-card-overlay" onClick={() => setSelected(null)}>
        <div className="appt-card" onClick={e => e.stopPropagation()}>
          <button className="card-close" onClick={() => setSelected(null)}>✕</button>
          <h3>📋 Appointment Details</h3>
          <div className="card-grid">
            <div className="card-field"><label>1. First Name</label><span>{appt.patient_name?.split(" ")[0] || "—"}</span></div>
            <div className="card-field"><label>2. Last Name</label><span>{appt.patient_name?.split(" ").slice(1).join(" ") || "—"}</span></div>
            <div className="card-field"><label>3. Sex Assigned at Birth</label><span>{patientParticipant.sex || "—"}</span></div>
            <div className="card-field"><label>4. Mobile No.</label><span>{patientParticipant.mobile || "—"}</span></div>
            <div className="card-field"><label>5. Date of Birth</label><span>{patientParticipant.dob || "—"}</span></div>
            <div className="card-field"><label>6. Email ID</label><span>{patientParticipant.email || "—"}</span></div>
            <div className="card-field"><label>7. Department</label><span>{appt.department || "—"}</span></div>
            <div className="card-field"><label>8. Personnel (Doctor)</label><span>{appt.doctor_name || "—"}</span></div>
            <div className="card-field"><label>9. Appointment Reason</label><span>{appt.appointment_reason || "—"}</span></div>
            <div className="card-field"><label>10. Date</label><span>{appt.scheduled_time?.split("T")[0] || "—"}</span></div>
            <div className="card-field"><label>11. Time</label><span>{appt.scheduled_time?.split("T")[1]?.slice(0,5) || "—"}</span></div>
            <div className="card-field"><label>12. Remark</label><span>{appt.remark || "—"}</span></div>
          </div>

          {/* 13. Start button — green if doctor available, grey if not */}
          <div className="card-start-row">
            {doctorAvailable === null && <span className="avail-checking">Checking doctor availability…</span>}
            {doctorAvailable === false && (
              <button className="btn-start-grey" disabled>
                🔴 Doctor Not Available Right Now
              </button>
            )}
            {doctorAvailable === true && (
              <button className="btn-start-green" onClick={handleStart}>
                🟢 Start Appointment
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Booking form ──────────────────────────────────────────────────────────

  const handleBook = async (e) => {
    e.preventDefault();
    setBookMsg("");

    if (!bookClinic || !bookDoctor || !bookDate || !bookTime) {
      setBookMsg("❌ Please fill all required fields");
      return;
    }

    try {
      const scheduledTime = `${bookDate}T${bookTime}:00`;
      const res = await fetch(`${API}/api/book-appointment/`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body   : JSON.stringify({
          clinic            : parseInt(bookClinic),
          doctor            : parseInt(bookDoctor),
          appointment_type  : bookType,
          appointment_reason: bookReason,
          scheduled_time    : scheduledTime,
          duration          : parseInt(bookDuration),
          department        : bookDepartment,
          remark            : bookRemark,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBookMsg(`❌ ${data.error || "Booking failed"}`);
        return;
      }

      setBookMsg("✅ Appointment booked successfully!");
      loadAppointments();
      // Reset form
      setBookClinic(""); setBookDoctor(""); setBookReason("");
      setBookDate(""); setBookTime(""); setBookRemark(""); setBookDepartment("");
    } catch (e) {
      setBookMsg("❌ Server error");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="patient-layout">

      {/* ═══ LEFT NAVBAR ═══ */}
      <nav className="patient-nav">
        <div className="nav-profile">
          <div className="nav-avatar">👤</div>
          <p className="nav-greeting">Hi, {fullName}</p>
        </div>

        <button
          className={`nav-btn ${section === "calendar" ? "active" : ""}`}
          onClick={() => setSection("calendar")}
        >
          📅 Calendar
        </button>
        <button
          className={`nav-btn ${section === "book" ? "active" : ""}`}
          onClick={() => setSection("book")}
        >
          📝 Book Appointment
        </button>
        <button
          className={`nav-btn ${section === "join" ? "active" : ""}`}
          onClick={() => setSection("join")}
        >
          🎥 Join Appointment
        </button>

        <button className="nav-logout" onClick={handleLogout}>
          🚪 Logout
        </button>
      </nav>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="patient-main">

        {/* ── 1. CALENDAR section ─────────────────────────────────────────── */}
        {section === "calendar" && (
          <div>
            <h2>📅 Upcoming Appointments</h2>
            <p className="section-hint">Click on a highlighted date to see appointment details.</p>
            {renderCalendar()}
            {/* Legend */}
            <div className="cal-legend">
              <span className="legend-dot has-appt" /> Appointments scheduled
              <span className="legend-dot today" style={{marginLeft:16}} /> Today
            </div>
          </div>
        )}

        {/* ── 2. BOOK APPOINTMENT section ─────────────────────────────────── */}
        {section === "book" && (
          <div className="book-section">
            <h2>📝 Book an Appointment</h2>
            <form className="book-form" onSubmit={handleBook}>

              {/* Step 1: Clinic */}
              <label>Select Clinic *</label>
              <select value={bookClinic} onChange={e => setBookClinic(e.target.value)} required>
                <option value="">— Choose clinic —</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* Step 2: Appointment type */}
              <label>Appointment Type *</label>
              <select value={bookType} onChange={e => setBookType(e.target.value)}>
                <option value="consultation">Consultation</option>
                <option value="semen_collection">Semen Collection</option>
                <option value="pathology">Pathology</option>
                <option value="ultrasound">Ultrasound</option>
                <option value="surgery">Surgery</option>
              </select>

              {/* Step 3: Doctor (filtered by clinic) */}
              <label>Select Doctor *</label>
              <select
                value={bookDoctor}
                onChange={e => setBookDoctor(e.target.value)}
                disabled={!bookClinic}
                required
              >
                <option value="">— Choose doctor —</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>
                    Dr. {d.full_name} {d.department ? `(${d.department})` : ""}
                  </option>
                ))}
              </select>

              {/* Step 4: Details */}
              <label>Appointment Reason</label>
              <input
                type="text"
                placeholder="e.g. Chest pain, routine checkup"
                value={bookReason}
                onChange={e => setBookReason(e.target.value)}
              />

              <label>Department</label>
              <input
                type="text"
                placeholder="e.g. Cardiology"
                value={bookDepartment}
                onChange={e => setBookDepartment(e.target.value)}
              />

              <label>Date *</label>
              <input
                type="date"
                value={bookDate}
                min={todayStr()}
                onChange={e => setBookDate(e.target.value)}
                required
              />

              <label>Time *</label>
              <input
                type="time"
                value={bookTime}
                onChange={e => setBookTime(e.target.value)}
                required
              />

              <label>Duration (minutes)</label>
              <select value={bookDuration} onChange={e => setBookDuration(e.target.value)}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
              </select>

              <label>Remark</label>
              <textarea
                placeholder="Any special notes or instructions for the doctor"
                value={bookRemark}
                onChange={e => setBookRemark(e.target.value)}
                rows={3}
              />

              <button type="submit" className="btn-book">
                📅 Confirm Booking
              </button>

              {bookMsg && <p className="book-msg">{bookMsg}</p>}
            </form>
          </div>
        )}

        {/* ── 3. JOIN APPOINTMENT section ─────────────────────────────────── */}
        {section === "join" && (
          <div>
            <h2>🎥 Today's Appointments</h2>
            <p className="section-hint">
              Appointments scheduled for today ({todayStr()}). The "Start" button is active only when the doctor is online.
            </p>

            {todayAppointments.length === 0 ? (
              <p className="empty-msg">No appointments scheduled for today.</p>
            ) : (
              <div className="join-list">
                {todayAppointments.map(appt => (
                  <TodayAppointmentRow
                    key={appt.meeting_id}
                    appt={appt}
                    token={token}
                    navigate={navigate}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ═══ APPOINTMENT DETAIL CARD OVERLAY ═══ */}
      {selected && renderAppointmentCard(selected)}
    </div>
  );
}


// ─── Sub-component: one row in the "Join" section ─────────────────────────────
function TodayAppointmentRow({ appt, token, navigate }) {
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    if (!appt.doctor) return;
    fetch(`${API}/api/doctor/available/${appt.doctor}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setAvailable(d.available))
      .catch(() => setAvailable(false));
  }, [appt.doctor, token]);

  const handleJoin = async () => {
    if (!available) return;
    try {
      const res = await fetch(`${API}/api/meeting/start/`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body   : JSON.stringify({ meeting_id: appt.meeting_id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Cannot join"); return; }
      navigate(`/patient/${data.room_id}?meeting_id=${data.meeting_id}`);
    } catch (e) { alert("Error joining appointment"); }
  };

  const time = appt.scheduled_time?.split("T")[1]?.slice(0,5) || "";

  return (
    <div className="join-row">
      <div className="join-info">
        <strong>{time}</strong>
        <span>Dr. {appt.doctor_name}</span>
        <span>{appt.appointment_reason || "Consultation"}</span>
        <span className="join-clinic">{appt.clinic_name}</span>
      </div>
      <button
        className={`btn-join ${available ? "green" : "grey"}`}
        onClick={handleJoin}
        disabled={!available}
        title={available ? "Doctor is online — click to join" : "Doctor is not online yet"}
      >
        {available === null ? "⏳ Checking…" : available ? "🟢 Start" : "🔴 Not Available"}
      </button>
    </div>
  );
}