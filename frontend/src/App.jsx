import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Help from "./pages/Help";
import Map from "./pages/Map";
import Chat from "./pages/Chat";
import CrisisDetail from "./pages/CrisisDetail";

function Timeline() {
  const { useNavigate } = require("react-router-dom");
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Nunito, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Timeline</h1>
      <p style={{ color: "#666" }}>Coming soon</p>
      <button onClick={() => navigate("/")} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 24, border: "none", background: "#1a1a2e", color: "#fff", fontFamily: "Nunito, sans-serif", fontWeight: 700, cursor: "pointer" }}>← Back to Home</button>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/help" element={<Help />} />
        <Route path="/map" element={<Map />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/crisis" element={<CrisisDetail />} />
        <Route path="/timeline" element={<Timeline />} />
      </Routes>
    </BrowserRouter>
  );
}