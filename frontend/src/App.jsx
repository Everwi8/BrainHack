import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthProvider";
import { useAuth } from "./lib/auth";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Help from "./pages/Help";
import Map from "./pages/Map";
import Chat from "./pages/Chat";
import CrisisDetail from "./pages/CrisisDetail";
import Tasks from "./pages/Tasks";
import Timeline from "./pages/Timeline";
import Volunteers from "./pages/Volunteers";
import ReportCrisis from "./pages/ReportCrisis";

// Protected gates a route behind a valid session, redirecting to /login.
function Protected({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Login />} />  {/* start at login */}
          <Route path="/home" element={<Protected><Home /></Protected>} />
          <Route path="/help" element={<Protected><Help /></Protected>} />
          <Route path="/map" element={<Protected><Map /></Protected>} />
          <Route path="/chat" element={<Protected><Chat /></Protected>} />
          <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
          <Route path="/crises/:id" element={<Protected><CrisisDetail /></Protected>} />
          <Route path="/timeline" element={<Protected><Timeline /></Protected>} />
          <Route path="/volunteers" element={<Protected><Volunteers /></Protected>} />
          <Route path="/report" element={<Protected><ReportCrisis /></Protected>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
