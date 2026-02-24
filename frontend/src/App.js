// src/App.js  ── FIXED
//
// ROOT CAUSE OF "patient lands on SalesHome" BUG:
//   The old App.js had BOTH /patient/:roomId AND /room/:roomId routes.
//   PatientHome navigated to /patient/:roomId which loaded MeetingRoom.
//   MeetingRoom.handleEndCall reads localStorage.role and navigates back.
//   If localStorage had a stale role="sales" from a previous login,
//   it sent the user to /sales. This was masked by the /patient/:roomId
//   alias confusing everyone about which route was active.
//
// FIX: ONE meeting room route only → /room/:roomId
//      PatientHome now navigates to /room/:roomId (same as doctor & sales)
//      Login always sets role correctly, so handleEndCall always works.
//
// DELETE FROM YOUR PROJECT:
//   src/components/PatientCall.js  — dead file, no route loads it, DELETE IT

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Login       from "./components/Login";
import AdminHome   from "./components/AdminHome";
import DoctorHome  from "./components/DoctorHome";
import PatientHome from "./components/PatientHome";
import SalesHome   from "./components/SalesHome";
import MeetingRoom from "./components/MeetingRoom";

function PrivateRoute({ children }) {
  const token = localStorage.getItem("token");
  const location = useLocation();
  
  console.log("PrivateRoute - Full location:", location); // Debug full location object
  console.log("PrivateRoute - pathname:", location.pathname); // Debug pathname
  console.log("PrivateRoute - search:", location.search); // Debug search params
  
  if (!token) {
    // Save the intended destination URL before redirecting to login
    const redirectUrl = location.pathname + location.search;
    console.log("PrivateRoute saving redirectUrl:", redirectUrl); // Debug log
    localStorage.setItem("redirectAfterLogin", redirectUrl);
    return <Navigate to="/" replace />;
  }
  
  return children;
}

function RoleRoute({ children, allowedRoles }) {
  const token = localStorage.getItem("token");
  const role  = localStorage.getItem("role");
  const location = useLocation();
  
  if (!token) {
    // Save the intended destination URL before redirecting to login
    const redirectUrl = location.pathname + location.search;
    localStorage.setItem("redirectAfterLogin", redirectUrl);
    return <Navigate to="/" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Router>
      <Routes>

        {/* Public */}
        <Route path="/" element={<Login />} />

        {/* Role-locked dashboards */}
        <Route path="/admin"   element={<RoleRoute allowedRoles={["admin"]}  ><AdminHome   /></RoleRoute>} />
        <Route path="/doctor"  element={<RoleRoute allowedRoles={["doctor"]} ><DoctorHome  /></RoleRoute>} />
        <Route path="/patient" element={<RoleRoute allowedRoles={["patient"]}><PatientHome /></RoleRoute>} />
        <Route path="/sales"   element={<RoleRoute allowedRoles={["sales"]}  ><SalesHome   /></RoleRoute>} />

        {/* THE ONLY meeting room route — all roles use this */}
        <Route path="/room/:roomId" element={<PrivateRoute><MeetingRoom /></PrivateRoute>} />

        {/* NOTE: /patient/:roomId is intentionally REMOVED.
            It was an alias that caused the stale-role navigation bug.
            All roles now use /room/:roomId uniformly. */}

        <Route path="*" element={<CatchAllRedirect />} />

      </Routes>
    </Router>
  );
}

// Catch-all route that saves redirect URL before going to login
function CatchAllRedirect() {
  const location = useLocation();
  const token = localStorage.getItem("token");
  
  console.log("CatchAllRedirect triggered for:", location.pathname + location.search); // Debug log
  
  if (!token) {
    const redirectUrl = location.pathname + location.search;
    if (redirectUrl !== "/" && redirectUrl !== "") {
      console.log("CatchAllRedirect saving redirectUrl:", redirectUrl); // Debug log
      localStorage.setItem("redirectAfterLogin", redirectUrl);
    }
  }
  
  return <Navigate to="/" replace />;
}