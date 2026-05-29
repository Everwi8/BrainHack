// Jerald — OneMap embed with crisis/shelter/hospital markers and filter toggles
import Navbar from "../components/layout/NavBar";
export default function Map() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" }}>
      <Navbar />
      <div style={{ padding: "20px" }}>
        <h1>Map</h1>
        <p>Welcome to the map!</p>
      </div>
    </div>
  );
}
