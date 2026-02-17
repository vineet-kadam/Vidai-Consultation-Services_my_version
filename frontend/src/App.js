// src/App.js
// Main router — decides which page to show based on the URL path.

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login         from "./components/Login";
import DoctorHome    from "./components/DoctorHome";
import AdminHome     from "./components/AdminHome";
import PatientHome   from "./components/PatientHome";   // ← Patient dashboard
import PatientCall   from "./components/PatientCall";   // ← Patient video call (FIXED)

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"                element={<Login/>}       />
        <Route path="/doctor"          element={<DoctorHome/>}  />
        <Route path="/admin"           element={<AdminHome/>}   />
        <Route path="/patient"         element={<PatientHome/>} />
        <Route path="/patient/:roomId" element={<PatientCall/>} />
      </Routes>
    </Router>
  );
}

export default App;