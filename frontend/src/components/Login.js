// src/components/Login.js
// Login page — same page for Admin, Doctor, and Patient.
// After login, the server tells us the user's role and we navigate to the right page.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL as API } from "../config";
import "./Login.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res  = await fetch(`${API}/api/login/`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError("Invalid credentials");
        setLoading(false);
        return;
      }

      // Save token and user info to localStorage
      localStorage.setItem("token",     data.access);
      localStorage.setItem("role",      data.role);
      localStorage.setItem("username",  data.username);
      localStorage.setItem("full_name", data.full_name);

      // Check if there's a redirect URL saved (e.g., user tried to access meeting room without login)
      const redirectUrl = localStorage.getItem("redirectAfterLogin");
      if (redirectUrl) {
        localStorage.removeItem("redirectAfterLogin");
        navigate(redirectUrl);
        return;
      }

      // Navigate based on role returned by the backend
      if (data.role === "admin" || data.is_superuser) {
        navigate("/admin");
      } else if (data.role === "doctor") {
        navigate("/doctor");
      } else if (data.role === "patient") {
        navigate("/patient");
      } else if (data.role === "sales") {
        navigate("/sales");
      } else {
        navigate("/doctor"); // fallback
      }

    } catch (err) {
      setError("Server error — make sure the backend is running");
      setLoading(false);
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

        <button onClick={handleLogin} disabled={loading}>
          {loading ? <span className="spinner"></span> : "Login"}
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}