// src/App.js

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./components/Login";
import DoctorHome from "./components/DoctorHome";
import AdminHome from "./components/AdminHome";
import PatientCall from "./components/PatientCall";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/doctor" element={<DoctorHome />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/patient/:roomId" element={<PatientCall />} />
      </Routes>
    </Router>
  );
}

export default App;