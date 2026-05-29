// James — volunteer group chat page (tabbed by crisis, voice recording, task status tracker)
import Navbar from "../components/layout/NavBar";
export default function Volunteers() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" }}>
      <Navbar />
      <div style={{ padding: "20px" }}>
        <h1>Volunteer Chat</h1>
        <p>Welcome to the volunteer chat!</p>
      </div>
    </div>
  );
}
