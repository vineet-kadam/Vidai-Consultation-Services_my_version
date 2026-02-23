// src/components/PatientHome.js -- UPDATED with Time Grid
// Changes:
//  • Replaced dropdown time selector with clickable time grid (15-minute intervals)
//  • Shows all times from 00:00 to 23:45 in a responsive grid layout
//  • Available slots are highlighted, unavailable are dimmed
//  • Selected time is shown with green checkmark

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL as API } from "../config";
import "./PatientHome.css";

const toDateStr = (d) => d.toISOString().split("T")[0];
const todayStr  = () => toDateStr(new Date());
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS    = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];

const to12h = (time24) => {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${mStr} ${ampm}`;
};

const timeFrom = (dt) => {
  if (!dt) return "";
  return to12h(dt.split("T")[1]?.slice(0, 5));
};

const isTimeToJoin = (scheduledTime) => {
  if (!scheduledTime) return false;
  const apptTime = new Date(scheduledTime);
  const now      = new Date();
  const diffMin  = (apptTime - now) / 60000;
  return diffMin <= 15;
};

const SALES_MEETING_TYPE = "sales_meeting";
const isSalesMtgType = (t) => t === SALES_MEETING_TYPE;

export default function PatientHome() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");
  const fullName = localStorage.getItem("full_name") || "Patient";

  const [section, setSection] = useState("calendar");
  const [appointments, setAppointments] = useState([]);

  const today = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate,  setSelectedDate]  = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [doctorAvailable, setDoctorAvailable] = useState(null);

  // ── Booking form state ──────────────────────────────────────────────────
  const [clinics,        setClinics]        = useState([]);
  const [doctors,        setDoctors]        = useState([]);
  const [salesUsers,     setSalesUsers]     = useState([]);

  const [bookType,       setBookType]       = useState("consultation");
  const [bookClinic,     setBookClinic]     = useState("");
  const [bookDoctor,     setBookDoctor]     = useState("");
  const [bookSales,      setBookSales]      = useState("");
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

  const isSalesMeeting = isSalesMtgType(bookType);

  useEffect(() => { if (!token) navigate("/"); }, [token, navigate]);

  const loadAppointments = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/patient/appointments/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAppointments(await res.json());
    } catch (e) { console.error(e); }
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
    fetch(`${API}/api/users/sales/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setSalesUsers).catch(() => setSalesUsers([]));
  }, [token]);

  useEffect(() => {
    setBookClinic(""); setBookDoctor(""); setBookSales("");
    setBookDate(""); setBookTime("");
    setAvailSlots([]); setNoSlotsMsg(""); setBookMsg("");
  }, [bookType]);

  // Fetch slots for CONSULTATION
  useEffect(() => {
    if (isSalesMeeting) return;
    setAvailSlots([]);
    setBookTime("");
    setNoSlotsMsg("");
    if (!bookDoctor || !bookDate) return;

    setSlotsLoading(true);
    const params = new URLSearchParams({ date: bookDate });
    if (bookClinic) params.set("clinic", bookClinic);

    fetch(`${API}/api/doctor/slots/${bookDoctor}/?${params}`)
      .then(r => r.json())
      .then(data => {
        const slots = data.slots || [];
        setAvailSlots(slots);
        if (!slots.length) {
          setNoSlotsMsg("⚠ The selected doctor has no availability on this date. Please choose another date.");
        } else {
          setNoSlotsMsg("");
        }
      })
      .catch(() => setNoSlotsMsg("⚠ Could not load availability. Please try again."))
      .finally(() => setSlotsLoading(false));
  }, [bookDoctor, bookDate, bookClinic, isSalesMeeting]);

  // Fetch slots for SALES MEETING
  useEffect(() => {
    if (!isSalesMeeting) return;
    setAvailSlots([]);
    setBookTime("");
    setNoSlotsMsg("");
    if (!bookSales || !bookDate) return;

    setSlotsLoading(true);
    fetch(`${API}/api/sales/slots/${bookSales}/?date=${bookDate}`)
      .then(r => r.json())
      .then(data => {
        const slots = data.slots || [];
        setAvailSlots(slots);
        if (!slots.length) {
          setNoSlotsMsg("⚠ This sales representative has no availability on this date. Please choose another date.");
        } else {
          setNoSlotsMsg("");
        }
      })
      .catch(() => setNoSlotsMsg("⚠ Could not load availability. Please try again."))
      .finally(() => setSlotsLoading(false));
  }, [bookSales, bookDate, isSalesMeeting]);

  const appointmentsOnDate = (dateStr) =>
    appointments.filter(a => a.scheduled_time?.startsWith(dateStr));

  const selectedAppts = selectedDate ? appointmentsOnDate(selectedDate) : [];
  const selected = selectedAppts[selectedIndex] || null;

  useEffect(() => {
    if (!selected?.doctor) { setDoctorAvailable(null); return; }
    if (selected.appointment_type === SALES_MEETING_TYPE) { setDoctorAvailable(true); return; }
    fetch(`${API}/api/doctor/available/${selected.doctor}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setDoctorAvailable(d.available))
      .catch(() => setDoctorAvailable(false));
  }, [selected, token]);

  const handleLogout = () => { localStorage.clear(); navigate("/"); };
  const todayAppointments = appointments.filter(a => a.scheduled_time?.startsWith(todayStr()));

  // Calendar render
  const renderCalendar = () => {
    const firstDay    = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return (
      <div className="calendar">
        <div className="cal-header">
          <button onClick={() => { if (calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1); }}>‹</button>
          <span>{MONTHS[calMonth]} {calYear}</span>
          <button onClick={() => { if (calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1); }}>›</button>
        </div>
        <div className="cal-grid">
          {DAY_NAMES.map(d => <div key={d} className="cal-day-label">{d}</div>)}
          {cells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="cal-cell empty" />;
            const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const appts   = appointmentsOnDate(dateStr);
            const isToday = dateStr === todayStr();
            return (
              <div key={dateStr}
                className={`cal-cell ${isToday?"today":""} ${appts.length>0?"has-appt":""}`}
                onClick={() => { if (appts.length > 0) { setSelectedDate(dateStr); setSelectedIndex(0); } }}>
                <span className="day-num">{day}</span>
                {appts.length > 0 && <span className="appt-dot">{appts.length}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Appointment card
  const renderAppointmentCard = () => {
    if (!selected) return null;
    const appt    = selected;
    const pp      = appt.participants?.find(p => p.role === "patient") || {};
    const isEnded = appt.status === "ended";
    const total   = selectedAppts.length;
    const canJoinTime = isTimeToJoin(appt.scheduled_time);
    const isSalesMtg  = appt.appointment_type === SALES_MEETING_TYPE;

    const handleStart = async () => {
      if (!isSalesMtg && !doctorAvailable) return;
      try {
        const res = await fetch(`${API}/api/meeting/start/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ meeting_id: appt.meeting_id }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || "Cannot start appointment"); return; }
        navigate(`/room/${data.room_id}?meeting_id=${data.meeting_id}&role=patient`);
      } catch (e) { alert("Error starting appointment"); }
    };

    const canJoin = isSalesMtg ? true : (doctorAvailable === true);

    return (
      <div className="appt-card-overlay" onClick={() => { setSelectedDate(null); setSelectedIndex(0); }}>
        <div className="appt-card" onClick={e => e.stopPropagation()}>
          <button className="card-close" onClick={() => { setSelectedDate(null); setSelectedIndex(0); }}>✕</button>

          {total > 1 && (
            <div className="card-nav">
              <button disabled={selectedIndex===0} onClick={() => setSelectedIndex(i => i-1)}>‹</button>
              <span>Appointment {selectedIndex+1} of {total}</span>
              <button disabled={selectedIndex===total-1} onClick={() => setSelectedIndex(i => i+1)}>›</button>
            </div>
          )}

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <h3>{isSalesMtg ? "💼 Sales Meeting" : "📋 Appointment Details"}</h3>
            {isEnded && <span className="badge-ended">COMPLETED</span>}
            {isSalesMtg && !isEnded && (
              <span style={{ background:"rgba(245,158,11,0.15)", color:"#f59e0b", padding:"3px 10px", borderRadius:20, fontSize:"0.76rem", fontWeight:700 }}>
                SALES MEETING
              </span>
            )}
          </div>

          <div className="card-grid">
            <div className="card-field"><label>1. First Name</label> <span>{appt.patient_name?.split(" ")[0] || "—"}</span></div>
            <div className="card-field"><label>2. Last Name</label>  <span>{appt.patient_name?.split(" ").slice(1).join(" ") || "—"}</span></div>
            {isSalesMtg ? (
              <>
                <div className="card-field"><label>3. Sales Rep</label>    <span>{appt.sales_name || "—"}</span></div>
                <div className="card-field"><label>4. Mobile No.</label>   <span>{pp.mobile || "—"}</span></div>
              </>
            ) : (
              <>
                <div className="card-field"><label>3. Sex at Birth</label> <span>{pp.sex || "—"}</span></div>
                <div className="card-field"><label>4. Mobile No.</label>   <span>{pp.mobile || "—"}</span></div>
              </>
            )}
            <div className="card-field"><label>5. Date of Birth</label>   <span>{pp.dob || "—"}</span></div>
            <div className="card-field"><label>6. Email ID</label>         <span>{pp.email || "—"}</span></div>
            {!isSalesMtg && (
              <>
                <div className="card-field"><label>7. Department</label>   <span>{appt.department || "—"}</span></div>
                <div className="card-field"><label>8. Doctor</label>       <span>{appt.doctor_name ? `Dr. ${appt.doctor_name}` : "—"}</span></div>
              </>
            )}
            <div className="card-field"><label>{isSalesMtg ? "7." : "9."} Reason</label>    <span>{appt.appointment_reason || "—"}</span></div>
            <div className="card-field"><label>{isSalesMtg ? "8." : "10."} Date</label>     <span>{appt.scheduled_time?.split("T")[0] || "—"}</span></div>
            <div className="card-field"><label>{isSalesMtg ? "9." : "11."} Time</label>     <span>{timeFrom(appt.scheduled_time)}</span></div>
            <div className="card-field"><label>{isSalesMtg ? "10." : "12."} Remark</label>  <span>{appt.remark || "—"}</span></div>
          </div>

          {isEnded ? (
            <div style={{ marginTop:15, borderTop:"1px solid #334155", paddingTop:10 }}>
              <h4 style={{ margin:"0 0 5px", fontSize:14, color:"#94a3b8" }}>📝 Consultation Transcript</h4>
              <div className="transcript-box">
                {appt.speech_to_text || <em style={{ color:"#64748b" }}>No transcript recorded.</em>}
              </div>
            </div>
          ) : (
            <div className="card-start-row">
              {!canJoinTime && (
                <p className="avail-checking" style={{ textAlign:"center", marginBottom:8 }}>
                  ⏰ Meeting starts at {timeFrom(appt.scheduled_time)}
                </p>
              )}
              {!isSalesMtg && doctorAvailable === null && (
                <span className="avail-checking">Checking doctor availability…</span>
              )}
              {canJoin && canJoinTime  && <button className="btn-start-green" onClick={handleStart}>📹 Start Appointment</button>}
              {canJoin && !canJoinTime && <button className="btn-start-grey"  disabled>⏰ Too Early to Join</button>}
              {!isSalesMtg && doctorAvailable === false && (
                <button className="btn-start-grey" disabled>🚫 Doctor Not Available Right Now</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Time Grid Renderer (NEW)
  const renderTimeGrid = () => {
    const allTimeSlots = [];
    for (let h = 0; h < 24; h++) {
      for (const m of ["00", "15", "30", "45"]) {
        const time24 = `${String(h).padStart(2, "0")}:${m}`;
        allTimeSlots.push(time24);
      }
    }
    
    return (
      <div style={{marginTop:8}}>
        <div style={{
          display:"grid", 
          gridTemplateColumns:"repeat(auto-fill, minmax(90px, 1fr))", 
          gap:8, 
          maxHeight:400, 
          overflowY:"auto",
          padding:4,
          background:"#0a0f1a",
          borderRadius:8,
          border:"1px solid #334155",
        }}>
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
                  padding:"10px 8px",
                  borderRadius:6,
                  fontSize:"0.82rem",
                  transition:"all 0.15s",
                  background: isSelected 
                    ? "linear-gradient(135deg,#10b981,#34d399)" 
                    : isAvailable 
                      ? "#1e293b" 
                      : "#0f172a",
                  color: isSelected 
                    ? "#fff" 
                    : isAvailable 
                      ? "#f8fafc" 
                      : "#475569",
                  border: isSelected 
                    ? "2px solid #10b981" 
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

  // Booking form submit
  const handleBook = async (e) => {
    e.preventDefault();
    setBookMsg("");

    if (isSalesMeeting) {
      if (!bookSales || !bookDate || !bookTime) {
        setBookMsg("⚠ Please select a sales representative, date, and time.");
        return;
      }
    } else {
      if (!bookClinic || !bookDoctor || !bookDate || !bookTime) {
        setBookMsg("⚠ Please fill all required fields.");
        return;
      }
    }

    if (noSlotsMsg) {
      setBookMsg("⚠ No available slots on selected date. Please choose a different date.");
      return;
    }

    try {
      const body = {
        appointment_type  : bookType,
        appointment_reason: bookReason,
        scheduled_time    : `${bookDate}T${bookTime}:00`,
        duration          : parseInt(bookDuration),
        remark            : bookRemark,
      };

      if (isSalesMeeting) {
        body.sales_id = parseInt(bookSales);
      } else {
        body.clinic     = parseInt(bookClinic);
        body.doctor     = parseInt(bookDoctor);
        body.department = bookDepartment;
        if (bookSales) body.sales_id = parseInt(bookSales);
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
      setBookClinic(""); setBookDoctor(""); setBookSales("");
      setBookReason(""); setBookDate(""); setBookTime("");
      setBookRemark(""); setBookDepartment("");
      setAvailSlots([]); setNoSlotsMsg("");
    } catch (e) { setBookMsg("⚠ Server error"); }
  };

  return (
    <div className="patient-layout">
      <nav className="patient-nav">
        <div className="nav-profile">
          <div className="nav-avatar">👤</div>
          <p className="nav-greeting">Hi, {fullName}</p>
        </div>
        <button className={`nav-btn ${section==="calendar"?"active":""}`} onClick={() => setSection("calendar")}>📅 Calendar</button>
        <button className={`nav-btn ${section==="book"    ?"active":""}`} onClick={() => setSection("book")}>📝 Book Appointment</button>
        <button className={`nav-btn ${section==="join"    ?"active":""}`} onClick={() => setSection("join")}>📹 Join Appointment</button>
        <button className="nav-logout" onClick={handleLogout}>🚪 Logout</button>
      </nav>

      <main className="patient-main">

        {section === "calendar" && (
          <div>
            <h2>📅 Upcoming Appointments</h2>
            <p className="section-hint">Click on a highlighted date to see appointment details.</p>
            {renderCalendar()}
          </div>
        )}

        {section === "book" && (
          <div className="book-section">
            <h2>📝 Book an Appointment</h2>
            <form className="book-form" onSubmit={handleBook}>

              <label>Appointment Type *</label>
              <select value={bookType} onChange={e => setBookType(e.target.value)}>
                <option value="consultation">Consultation</option>
                <option value="semen_collection">Semen Collection</option>
                <option value="pathology">Pathology</option>
                <option value="ultrasound">Ultrasound</option>
                <option value="surgery">Surgery</option>
                <option value="sales_meeting">Sales Meeting</option>
              </select>

              {isSalesMeeting && (
                <>
                  <div className="book-type-badge sales-meeting-badge">
                    💼 Sales Meeting — No clinic or doctor required
                  </div>

                  <label>Select Sales Representative *</label>
                  <select value={bookSales} onChange={e => setBookSales(e.target.value)} required>
                    <option value="">— Choose a sales rep —</option>
                    {salesUsers.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name || s.username}{s.clinic ? ` · ${s.clinic}` : ""}</option>
                    ))}
                  </select>
                </>
              )}

              {!isSalesMeeting && (
                <>
                  <label>Select Clinic *</label>
                  <select value={bookClinic} onChange={e => { setBookClinic(e.target.value); setBookDoctor(""); }} required>
                    <option value="">— Choose clinic —</option>
                    {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>

                  <label>Select Doctor *</label>
                  <select value={bookDoctor} onChange={e => setBookDoctor(e.target.value)} disabled={!bookClinic} required>
                    <option value="">— Choose doctor —</option>
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>Dr. {d.full_name}{d.department ? ` (${d.department})` : ""}</option>
                    ))}
                  </select>

                  <label>Assign Sales Rep <span style={{ fontWeight:400, color:"#94a3b8" }}>(optional)</span></label>
                  <select value={bookSales} onChange={e => setBookSales(e.target.value)}>
                    <option value="">— No sales rep —</option>
                    {salesUsers.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name || s.username}{s.clinic ? ` · ${s.clinic}` : ""}</option>
                    ))}
                  </select>
                  {bookSales && (
                    <p style={{ fontSize:12, color:"#f59e0b", margin:"-6px 0 6px" }}>
                      ⚠ Sales rep will be included in the meeting room.
                    </p>
                  )}

                  <label>Department</label>
                  <input type="text" placeholder="e.g. Cardiology"
                    value={bookDepartment} onChange={e => setBookDepartment(e.target.value)} />
                </>
              )}

              <label>Reason</label>
              <input type="text" placeholder="e.g. Chest pain, routine checkup, product discussion"
                value={bookReason} onChange={e => setBookReason(e.target.value)} />

              <label>Date *</label>
              <input type="date" value={bookDate} min={todayStr()}
                onChange={e => setBookDate(e.target.value)} required />

              <label>
                Time *{" "}
                {slotsLoading && <span style={{ fontWeight:400, color:"#94a3b8" }}>Loading slots…</span>}
              </label>
              {(() => {
                const needsDoctor  = !isSalesMeeting && (!bookDoctor || !bookDate);
                const needsSales   =  isSalesMeeting && (!bookSales  || !bookDate);
                if (needsDoctor || needsSales) {
                  return (
                    <p style={{ fontSize:13, color:"#64748b", margin:"0 0 4px", fontStyle:"italic" }}>
                      {isSalesMeeting
                        ? "Select a sales representative and date to see available time slots."
                        : "Select a doctor and date to see available time slots."}
                    </p>
                  );
                }
                if (slotsLoading) return <p style={{ fontSize:13, color:"#94a3b8", margin:"0 0 4px" }}>Checking availability…</p>;
                if (noSlotsMsg)   return <p style={{ fontSize:13, color:"#f87171", margin:"0 0 4px" }}>{noSlotsMsg}</p>;
                return renderTimeGrid();
              })()}

              <label>Duration (minutes)</label>
              <select value={bookDuration} onChange={e => setBookDuration(e.target.value)}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
              </select>

              <label>Remark</label>
              <textarea placeholder="Any special notes"
                value={bookRemark} onChange={e => setBookRemark(e.target.value)} rows={3} />

              <button type="submit" className="btn-book" disabled={!!noSlotsMsg || slotsLoading || !bookTime}>
                ✅ Confirm Booking
              </button>
              {bookMsg && <p className="book-msg">{bookMsg}</p>}
            </form>
          </div>
        )}

        {section === "join" && (
          <div>
            <h2>📹 Today's Appointments</h2>
            <p className="section-hint">Appointments for today ({todayStr()}).</p>
            {todayAppointments.length === 0
              ? <p className="empty-msg">No appointments scheduled for today.</p>
              : <div className="join-list">
                  {todayAppointments.map(appt => (
                    <TodayAppointmentRow key={appt.meeting_id} appt={appt} token={token} navigate={navigate} />
                  ))}
                </div>
            }
          </div>
        )}
      </main>

      {selected && renderAppointmentCard()}
    </div>
  );
}

function TodayAppointmentRow({ appt, token, navigate }) {
  const [available, setAvailable] = useState(null);
  const isSalesMtg = appt.appointment_type === SALES_MEETING_TYPE;

  useEffect(() => {
    if (isSalesMtg) { setAvailable(true); return; }
    if (!appt.doctor) return;
    const check = () => {
      fetch(`${API}/api/doctor/available/${appt.doctor}/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(d => setAvailable(d.available)).catch(() => setAvailable(false));
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [appt.doctor, token, isSalesMtg]);

  const handleJoin = async () => {
    try {
      const res = await fetch(`${API}/api/meeting/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meeting_id: appt.meeting_id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Cannot join"); return; }
      navigate(`/room/${data.room_id}?meeting_id=${data.meeting_id}&role=patient`);
    } catch (e) { alert("Error joining appointment"); }
  };

  const time    = to12h(appt.scheduled_time?.split("T")[1]?.slice(0, 5) || "");
  const isEnded = appt.status === "ended";

  return (
    <div className="join-row">
      <div className="join-info">
        <strong>{time}</strong>
        {isSalesMtg
          ? <span>💼 {appt.sales_name || "Sales Rep"}</span>
          : <span>Dr. {appt.doctor_name}</span>
        }
        <span>{appt.appointment_reason || (isSalesMtg ? "Sales Meeting" : "Consultation")}</span>
        {appt.clinic_name && <span className="join-clinic">{appt.clinic_name}</span>}
        {isSalesMtg && <span className="join-clinic" style={{ background:"rgba(245,158,11,0.15)", color:"#f59e0b" }}>Sales</span>}
      </div>
      {isEnded
        ? <span className="badge-ended-sm">Ended</span>
        : <button
            className={`btn-join ${available ? "green" : "grey"}`}
            onClick={handleJoin}
            disabled={!available}>
            {available === null ? "⏳ Checking…" : available ? "📹 Join" : "🚫 Not Available"}
          </button>
      }
    </div>
  );
}