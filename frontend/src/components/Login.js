// src/components/Login.js
// Login page — same page for Admin, Doctor, and Patient.
// After login, the server tells us the user's role and we navigate to the right page.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const API = "http://localhost:8000";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }

    try {
      const res  = await fetch(`${API}/api/login/`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError("Invalid credentials");
        return;
      }

      // Save token and user info to localStorage
      localStorage.setItem("token",     data.access);
      localStorage.setItem("role",      data.role);
      localStorage.setItem("username",  data.username);
      localStorage.setItem("full_name", data.full_name);

      // Navigate based on role returned by the backend
      if (data.role === "admin" || data.is_superuser) {
        navigate("/admin");
      } else if (data.role === "doctor") {
        navigate("/doctor");
      } else if (data.role === "patient") {
        navigate("/patient");
      } else {
        navigate("/doctor"); // fallback
      }

    } catch (err) {
      setError("Server error — make sure the backend is running");
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>🩺 Medical Consultation System</h2>

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleLogin()}
          autoComplete="current-password"
        />

        <button onClick={handleLogin}>Login</button>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}