// src/components/AdminHome.js
// Admin dashboard — manage clinics, patients, and doctors.

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminHome.css";

const API = "http://localhost:8000";

export default function AdminHome() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  const [clinics,       setClinics]       = useState([]);
  const [patients,      setPatients]      = useState([]);
  const [doctors,       setDoctors]       = useState([]);
  const [selectedClinic,setSelectedClinic]= useState("");

  // ── Create clinic form ────────────────────────────────────────────────────
  const [newClinicName, setNewClinicName] = useState("");
  const [newClinicId,   setNewClinicId]   = useState("");

  // ── Create user form (patient or doctor) ──────────────────────────────────
  const [newUsername,  setNewUsername]  = useState("");
  const [newPassword,  setNewPassword]  = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName,  setNewLastName]  = useState("");
  const [newEmail,     setNewEmail]     = useState("");
  const [newRole,      setNewRole]      = useState("patient");
  const [newMobile,    setNewMobile]    = useState("");
  const [newDOB,       setNewDOB]       = useState("");
  const [newSex,       setNewSex]       = useState("M");
  const [newClinicUser,setNewClinicUser]= useState("");
  const [newDept,      setNewDept]      = useState("");

  useEffect(() => { if (!token) navigate("/"); }, [token, navigate]);

  useEffect(() => { fetchClinics(); fetchDoctors(); }, []);

  useEffect(() => {
    if (selectedClinic) fetchPatients(selectedClinic);
    else setPatients([]);
  }, [selectedClinic]);

  const handleLogout = () => { localStorage.clear(); navigate("/"); };

  const fetchClinics = async () => {
    try {
      const res = await fetch(`${API}/api/clinics/`);
      if (res.ok) setClinics(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchPatients = async (clinicId) => {
    try {
      const res = await fetch(`${API}/api/list-patients/?clinic=${clinicId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPatients(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchDoctors = async () => {
    try {
      const res = await fetch(`${API}/api/doctors/`);
      if (res.ok) setDoctors(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleCreateClinic = async (e) => {
    e.preventDefault();
    if (!newClinicName || !newClinicId) return alert("Please fill all fields");
    try {
      const res = await fetch(`${API}/api/create-clinic/`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body   : JSON.stringify({ name: newClinicName, clinic_id: newClinicId }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || "Failed");
      alert("Clinic created!");
      setNewClinicName(""); setNewClinicId("");
      fetchClinics();
    } catch (e) { alert("Error"); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !newFirstName) return alert("Username, password and first name are required");
    try {
      const res = await fetch(`${API}/api/create-user/`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body   : JSON.stringify({
          username   : newUsername,
          password   : newPassword,
          first_name : newFirstName,
          last_name  : newLastName,
          email      : newEmail,
          role       : newRole,
          mobile     : newMobile,
          date_of_birth: newDOB || null,
          sex        : newSex,
          clinic     : newClinicUser || null,
          department : newDept,
        }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || "Failed");
      alert(`${newRole.charAt(0).toUpperCase() + newRole.slice(1)} account created!`);
      // Reset
      setNewUsername(""); setNewPassword(""); setNewFirstName(""); setNewLastName("");
      setNewEmail(""); setNewMobile(""); setNewDOB(""); setNewDept("");
      fetchDoctors();
      if (selectedClinic) fetchPatients(selectedClinic);
    } catch (e) { alert("Error"); }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h2>👨‍💼 Admin Dashboard</h2>
        <button className="btn-logout" onClick={handleLogout}>🚪 Logout</button>
      </div>

      <div className="admin-grid">

        {/* ── Create Clinic ── */}
        <div className="admin-card">
          <h3>🏥 Create New Clinic</h3>
          <form onSubmit={handleCreateClinic}>
            <input placeholder="Clinic Name" value={newClinicName} onChange={e => setNewClinicName(e.target.value)} required />
            <input placeholder="Clinic ID (e.g. CLINIC-001)" value={newClinicId} onChange={e => setNewClinicId(e.target.value)} required />
            <button type="submit" className="btn-primary">➕ Create Clinic</button>
          </form>
        </div>

        {/* ── Create Doctor / Patient account ── */}
        <div className="admin-card">
          <h3>👤 Create User Account</h3>
          <form onSubmit={handleCreateUser}>
            <select value={newRole} onChange={e => setNewRole(e.target.value)}>
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
              <option value="sales">Sales</option>
            </select>
            <input placeholder="Username *"   value={newUsername}  onChange={e => setNewUsername(e.target.value)}  required />
            <input type="password" placeholder="Password *" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
            <input placeholder="First Name *" value={newFirstName} onChange={e => setNewFirstName(e.target.value)} required />
            <input placeholder="Last Name"    value={newLastName}  onChange={e => setNewLastName(e.target.value)} />
            <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <input placeholder="Mobile No."  value={newMobile}   onChange={e => setNewMobile(e.target.value)} />
            <input type="date" placeholder="Date of Birth" value={newDOB} onChange={e => setNewDOB(e.target.value)} />
            <select value={newSex} onChange={e => setNewSex(e.target.value)}>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other / Prefer not to say</option>
            </select>
            {newRole === "doctor" && (
              <input placeholder="Department (e.g. Cardiology)" value={newDept} onChange={e => setNewDept(e.target.value)} />
            )}
            <select value={newClinicUser} onChange={e => setNewClinicUser(e.target.value)}>
              <option value="">Select Clinic (optional)</option>
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" className="btn-primary">➕ Create Account</button>
          </form>
        </div>

        {/* ── Existing Clinics ── */}
        <div className="admin-card">
          <h3>🏥 Existing Clinics</h3>
          <div className="list-container">
            {clinics.length === 0
              ? <p className="empty-message">No clinics yet</p>
              : <ul className="data-list">
                  {clinics.map(c => (
                    <li key={c.id}><strong>{c.name}</strong><span className="clinic-id">ID: {c.clinic_id}</span></li>
                  ))}
                </ul>
            }
          </div>
        </div>

        {/* ── Doctors ── */}
        <div className="admin-card">
          <h3>🩺 Doctors</h3>
          <div className="list-container">
            {doctors.length === 0
              ? <p className="empty-message">No doctors yet</p>
              : <ul className="data-list">
                  {doctors.map(d => (
                    <li key={d.id}>
                      <strong>Dr. {d.full_name}</strong>
                      <span className="clinic-id">{d.department || "—"}</span>
                    </li>
                  ))}
                </ul>
            }
          </div>
        </div>

        {/* ── View Patients ── */}
        <div className="admin-card">
          <h3>👥 View Patients by Clinic</h3>
          <select value={selectedClinic} onChange={e => setSelectedClinic(e.target.value)} className="clinic-selector">
            <option value="">Select Clinic</option>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="list-container">
            {!selectedClinic
              ? <p className="empty-message">Select a clinic</p>
              : patients.length === 0
                ? <p className="empty-message">No patients in this clinic</p>
                : <ul className="data-list">
                    {patients.map(p => (
                      <li key={p.id}>
                        <strong>{p.full_name}</strong>
                        <span className="patient-id">{p.email || p.username}</span>
                      </li>
                    ))}
                  </ul>
            }
          </div>
        </div>
      </div>
    </div>
  );
}