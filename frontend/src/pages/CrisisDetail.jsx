// Jerald — crisis detail view (AI summary, task cards, "I Want to Help" button, group chat link)
import Navbar from "../components/layout/NavBar";
export default function CrisisDetail() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" }}>
      <Navbar />
      <div style={{ padding: "20px" }}>
        <h1>Crisis Detail</h1>
        <p>Welcome to the crisis detail view!</p>
      </div>
    </div>
  );
}
