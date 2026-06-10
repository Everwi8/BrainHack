// Shared chat bubble renderer for both user and Brainy turns.
import { Bot } from "lucide-react";
import { UserCircle } from "lucide-react";

// Minimal markdown support for bold spans used in assistant responses.
function renderText(text) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

export default function MessageBubble({ role, text, timestamp, children }) {
  const isBot = role === "bot";

  return (
    <div style={{
      display: "flex",
      flexDirection: isBot ? "row" : "row-reverse",
      alignItems: "flex-end",
      gap: 10,
      marginBottom: 18,
    }}>
      {/* Avatar */}
      <div style={{
        width: 34, height: 34, borderRadius: "50%",
        background: isBot ? "#374151" : "#e0d5c5",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {isBot
          ? <Bot size={18} color="#fff" />
          : <UserCircle size={26} color="#7a6a56" />
        }
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: "65%",
        background: isBot ? "#fff" : "#DBEAFE",
        borderRadius: isBot ? "18px 18px 18px 4px" : "18px 18px 4px 18px",
        padding: "12px 16px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
      }}>
        <div style={{ fontSize: 14, color: "#1a1a2e", lineHeight: 1.6, textAlign: "left" }}>
          {renderText(text)}
        </div>
        {children}
        <div style={{
          fontSize: 11, color: "#9CA3AF", marginTop: 6,
          textAlign: isBot ? "left" : "right",
        }}>
          {timestamp}
        </div>
      </div>
    </div>
  );
}
