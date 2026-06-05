// James — volunteer group chat page (tabbed by crisis, voice recording, task status tracker)
import { useMemo, useState } from "react";
import { Camera, Mic, Paperclip, Play } from "lucide-react";
import Navbar from "../components/layout/NavBar";

// dummy data for volunteer groups and messages
const GROUPS = [
  {
    id: "brainy",
    label: "Brainy",
    title: "Brainy Coordination Channel",
    meta: "Islandwide Monitoring • 18 helpers • 5 Open Tasks",
    messages: [
      { id: "b1", sender: "Brainy • auto-update", role: "brainy", text: "Heavy rain cells moving toward North region. Flood risk elevated for Kranji in the next 30 minutes.", at: "09:11" },
      { id: "b2", sender: "RC Lim (Coordinator)", role: "coord", text: "Deploy 2 volunteers to Kranji drain point B. Confirm when dispatched.", at: "09:13" },
      { id: "b3", sender: "Me", role: "me", text: "Copy. Pairing up and moving now.", at: "09:14" },
    ],
  },
  {
    id: "flash-flood",
    label: "Flash Flood • 12",
    title: "Flash Flood - Pasir Ris Dr 3",
    meta: "Water 78% • 12 helpers • 3 Open Tasks",
    messages: [
      { id: "f1", sender: "Brainy • auto-update", role: "brainy", text: "PUB drain at 78%, up from 65% 15 min ago", at: "09:22" },
      { id: "f2", sender: "Aisha (Coordinator)", role: "coord", text: "PUB drain at 78%, up from 65% 15 min ago", at: "09:25" },
      { id: "f3", sender: "Me", role: "me", text: "I am on my way, 8 more minutes", at: "09:26" },
      { id: "f4", sender: "Brainy • auto-update", role: "brainy", text: "New task created by RC Lim: \"Reroute pedestrians at gate 3\"", at: "09:29" },
    ],
  },
  {
    id: "fire",
    label: "Fire • 5",
    title: "Fire - Bedok North Ave 3",
    meta: "Smoke level Medium • 5 helpers • 2 Open Tasks",
    messages: [
      { id: "r1", sender: "Brainy • auto-update", role: "brainy", text: "SCDF response team on-site. Keep perimeter clear for emergency vehicles.", at: "11:01" },
      { id: "r2", sender: "Hassan (Coordinator)", role: "coord", text: "Need 1 volunteer to guide evacuees to temporary shelter point.", at: "11:03" },
      { id: "r3", sender: "Me", role: "me", text: "Available. Moving to shelter point now.", at: "11:04" },
    ],
  },
];

function senderBadge(role) {
  if (role === "brainy") return "#B9D530";
  if (role === "coord") return "#4F7FEA";
  return "#9EC4DA";
}

export default function Volunteers() {
  const [activeGroup, setActiveGroup] = useState("flash-flood");
  const [draft, setDraft] = useState("");
  const group = useMemo(
    () => GROUPS.find((item) => item.id === activeGroup) ?? GROUPS[0],
    [activeGroup]
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#F5F0E8",
        fontFamily: "'Nunito', sans-serif",
        boxSizing: "border-box",
      }}
    >
      <Navbar />

      <main
        style={{
          width: "100%",
          maxWidth: 1660,
          margin: "0 auto",
          padding: "26px 26px 30px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          {GROUPS.map((item) => {
            const active = item.id === activeGroup;
            return (
              <button
                key={item.id}
                onClick={() => setActiveGroup(item.id)}
                style={{
                  border: "none",
                  borderRadius: 22,
                  padding: "11px 22px",
                  background: active ? "#111111" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#3F3F46",
                  fontSize: 33 / 2,
                  fontWeight: 700,
                  lineHeight: 1,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <section
          style={{
            border: "2px solid #1E1E1E",
            borderRadius: 30,
            background: "#ECE8DF",
            overflow: "hidden",
          }}
        >
          <header
            style={{
              borderBottom: "2px solid #1E1E1E",
              padding: "20px 50px 18px",
              background: "#E8E4D8",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 38 / 2, color: "#131313", lineHeight: 1.2 }}>
              {group.title}
            </div>
            <div
              style={{
                marginTop: 4,
                color: "#6F6E78",
                fontSize: 31 / 2,
                fontWeight: 700,
              }}
            >
              {group.meta}
            </div>
          </header>

          <div
            style={{
              background: "#f0e5e5",
              minHeight: "58vh",
              borderBottom: "2px solid #1E1E1E",
              padding: "20px 16px 26px",
              boxSizing: "border-box",
              overflowY: "auto",
            }}
          >
            {group.messages.map((message) => {
              if (message.role === "me") {
                return (
                  <div key={message.id} style={{ width: "100%", display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "42%" }}>
                      <div style={{ color: "#6F6D77", fontWeight: 700, fontSize: 30 / 2, marginBottom: 5 }}>{message.sender}</div>
                      <div
                        style={{
                          border: "2px solid #1E1E1E",
                          borderRadius: 999,
                          background: "#9EC4DA",
                          padding: "13px 22px",
                          fontSize: 34 / 2,
                          color: "#141414",
                          lineHeight: 1.25,
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      >
                        {message.text}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 16, maxWidth: "58%" }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: "50%",
                      background: senderBadge(message.role),
                      flexShrink: 0,
                      marginTop: 35 / 2,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: message.role === "brainy" ? "#D97706" : "#6F6D77",
                        fontWeight: 800,
                        fontSize: 33 / 2,
                        marginBottom: 5,
                      }}
                    >
                      {message.sender}
                    </div>
                    <div
                      style={{
                        border: "2px solid #1E1E1E",
                        borderRadius: 999,
                        background: "#ECE8DF",
                        padding: "13px 22px",
                        fontSize: 34 / 2,
                        color: "#141414",
                        lineHeight: 1.25,
                        boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
                      }}
                    >
                      {message.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <footer
            style={{
              padding: "14px 14px",
              background: "#ECE8DF",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 14,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: "50%",
                  border: "2px solid #1E1E1E",
                  background: "#F5F4F0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title="Attach Camera"
              >
                <Camera size={32} color="#111111" />
              </button>
              <button
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: "50%",
                  border: "2px solid #1E1E1E",
                  background: "#F5F4F0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title="Voice"
              >
                <Mic size={32} color="#111111" />
              </button>
              <button
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: "50%",
                  border: "2px solid #1E1E1E",
                  background: "#F5F4F0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title="Attach File"
              >
                <Paperclip size={32} color="#111111" />
              </button>
            </div>

            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message group..."
              style={{
                width: "100%",
                height: 56,
                borderRadius: 999,
                border: "2px solid #1E1E1E",
                background: "#E4E4E4",
                fontFamily: "'Nunito', sans-serif",
                fontSize: 34 / 2,
                color: "#111111",
                padding: "0 22px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <button
              title="Send Message"
              style={{
                width: 62,
                height: 62,
                borderRadius: "50%",
                border: "none",
                background: "#1C1E22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Play size={32} color="#FFFFFF" fill="#FFFFFF" />
            </button>
          </footer>
        </section>
      </main>
    </div>
  );
}
