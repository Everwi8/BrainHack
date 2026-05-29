// Perrin — AI chat page (Brainy conversation, photo capture, quick-action chips)
import Navbar from "../components/layout/NavBar";
export default function Chat() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#F5F0E8", fontFamily: "'Nunito', sans-serif", boxSizing: "border-box" }}>
      <Navbar />
      <div style={{ padding: "20px" }}>
        <h1>Chat with Brainy</h1>
        <p>Welcome to the chat!</p>
      </div>
    </div>
  );
}
