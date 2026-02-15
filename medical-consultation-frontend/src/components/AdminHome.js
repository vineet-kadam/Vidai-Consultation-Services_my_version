// src/components/AdminHome.js

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminHome.css";

export default function AdminHome() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // State
  const [clinics, setClinics] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState("");

  // Form states
  const [newClinicName, setNewClinicName] = useState("");
  const [newClinicId, setNewClinicId] = useState("");
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientId, setNewPatientId] = useState("");
  const [patientClinic, setPatientClinic] = useState("");

  // Auth guard
  useEffect(() => {
    if (!token) {
      window.location.href = "/";
    }
  }, [token]);

  // Load clinics on mount
  useEffect(() => {
    fetchClinics();
  }, []);

  // Load patients when clinic selected
  useEffect(() => {
    if (selectedClinic) {
      fetchPatients(selectedClinic);
    } else {
      setPatients([]);
    }
  }, [selectedClinic]);

  // ═══════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════════════
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  // ═══════════════════════════════════════════════════════════════════════
  // FETCH DATA
  // ═══════════════════════════════════════════════════════════════════════
  const fetchClinics = async () => {
    try {
      const res = await fetch("localhost/api/clinics/");
      const data = await res.json();
      setClinics(data);
    } catch (err) {
      console.error("Failed to fetch clinics", err);
    }
  };

  const fetchPatients = async (clinicId) => {
    try {
      const res = await fetch(`localhost/api/patients/${clinicId}/`);
      const data = await res.json();
      setPatients(data);
    } catch (err) {
      console.error("Failed to fetch patients", err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // CREATE CLINIC
  // ═══════════════════════════════════════════════════════════════════════
  const handleCreateClinic = async (e) => {
    e.preventDefault();

    if (!newClinicName || !newClinicId) {
      alert("Please fill in all clinic fields");
      return;
    }

    try {
      const res = await fetch("localhost/api/create-clinic/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newClinicName,
          clinic_id: newClinicId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error || "Failed to create clinic"}`);
        return;
      }

      alert("Clinic created successfully!");
      setNewClinicName("");
      setNewClinicId("");
      fetchClinics();
    } catch (err) {
      console.error("Error creating clinic", err);
      alert("Failed to create clinic");
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // CREATE PATIENT
  // ═══════════════════════════════════════════════════════════════════════
  const handleCreatePatient = async (e) => {
    e.preventDefault();

    if (!newPatientName || !newPatientId || !patientClinic) {
      alert("Please fill in all patient fields");
      return;
    }

    try {
      const res = await fetch("localhost/api/create-patient/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clinic: patientClinic,
          full_name: newPatientName,
          patient_id: newPatientId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error || "Failed to create patient"}`);
        return;
      }

      alert("Patient created successfully!");
      setNewPatientName("");
      setNewPatientId("");
      
      // Refresh patient list if same clinic selected
      if (selectedClinic === patientClinic) {
        fetchPatients(patientClinic);
      }
    } catch (err) {
      console.error("Error creating patient", err);
      alert("Failed to create patient");
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="admin-container">
      <div className="admin-header">
        <h2>👨‍💼 Admin Dashboard</h2>
        <button 
          className="btn-logout" 
          onClick={handleLogout}
        >
          🚪 Logout
        </button>
      </div>

      <div className="admin-grid">
        {/* CREATE CLINIC */}
        <div className="admin-card">
          <h3>🏥 Create New Clinic</h3>
          <form onSubmit={handleCreateClinic}>
            <input
              type="text"
              placeholder="Clinic Name"
              value={newClinicName}
              onChange={(e) => setNewClinicName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Clinic ID"
              value={newClinicId}
              onChange={(e) => setNewClinicId(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary">
              ➕ Create Clinic
            </button>
          </form>
        </div>

        {/* CREATE PATIENT */}
        <div className="admin-card">
          <h3>👤 Create New Patient</h3>
          <form onSubmit={handleCreatePatient}>
            <input
              type="text"
              placeholder="Patient Name"
              value={newPatientName}
              onChange={(e) => setNewPatientName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Patient ID"
              value={newPatientId}
              onChange={(e) => setNewPatientId(e.target.value)}
              required
            />
            <select
              value={patientClinic}
              onChange={(e) => setPatientClinic(e.target.value)}
              required
            >
              <option value="">Select Clinic</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary">
              ➕ Create Patient
            </button>
          </form>
        </div>

        {/* VIEW CLINICS */}
        <div className="admin-card">
          <h3>🏥 Existing Clinics</h3>
          <div className="list-container">
            {clinics.length === 0 ? (
              <p className="empty-message">No clinics yet</p>
            ) : (
              <ul className="data-list">
                {clinics.map((c) => (
                  <li key={c.id}>
                    <strong>{c.name}</strong>
                    <span className="clinic-id">ID: {c.clinic_id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* VIEW PATIENTS */}
        <div className="admin-card">
          <h3>👥 View Patients</h3>
          <select
            value={selectedClinic}
            onChange={(e) => setSelectedClinic(e.target.value)}
            className="clinic-selector"
          >
            <option value="">Select Clinic</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="list-container">
            {selectedClinic === "" ? (
              <p className="empty-message">Select a clinic to view patients</p>
            ) : patients.length === 0 ? (
              <p className="empty-message">No patients in this clinic</p>
            ) : (
              <ul className="data-list">
                {patients.map((p) => (
                  <li key={p.id}>
                    <strong>{p.full_name}</strong>
                    <span className="patient-id">ID: {p.patient_id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
