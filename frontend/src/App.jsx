import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Help from "./pages/Help";
import Map from "./pages/Map";
import Chat from "./pages/Chat";
import CrisisDetail from "./pages/CrisisDetail";
import Timeline from "./pages/Timeline";
import Volunteers from "./pages/Volunteers";
import ReportCrisis from "./pages/ReportCrisis";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Login />} />  {/* start at login */}
        <Route path="/home" element={<Home />} />
        <Route path="/help" element={<Help />} />
        <Route path="/map" element={<Map />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/crisis" element={<CrisisDetail />} />
        <Route path="/crises/:id" element={<CrisisDetail />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/volunteers" element={<Volunteers />} />
        <Route path="/report" element={<ReportCrisis />} />
      </Routes>
    </BrowserRouter>
  );
}
