import { useEffect, useRef, useState } from "react";
import { decryptMessageWithPrivateKey, encryptMessageForPublicKey } from "./crypto";

// Auto-detect API base: use same hostname as current page, or fallback to env/localhost
const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  return `http://${hostname}:3000`;
};
const API_BASE = getApiBase();
const WS_URL = `${API_BASE.replace(/^https?/, API_BASE.startsWith("https") ? "wss" : "ws")}/ws`;

export default function Chat({ user }) {
  const { userId, deviceId, keyPair } = user;
  const token = user.token || localStorage.getItem('token');
  const [toUser, setToUser] = useState("");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]); // {direction: 'in'|'out'|'system', text, from, to, time}
  const [status, setStatus] = useState("Connecting…");
  const wsRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "identify", userId, deviceId }));
      setStatus("Connected");
    };

    ws.onmessage = async (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload.type === "message.payload") {
          const plaintext = await decryptMessageWithPrivateKey(payload, keyPair.privateKey);
          addMessage({
            direction: "in",
            text: plaintext,
            from: `${payload.from.userId}/${payload.from.deviceId}`,
            to: `${payload.to.userId}/${payload.to.deviceId}`,
          });
        }
      } catch (err) {
        console.error("Failed to process message", err);
      }
    };

    ws.onerror = () => {
      setStatus("Error");
    };

    ws.onclose = () => {
      setStatus("Disconnected");
    };

    return () => ws.close();
  }, [deviceId, keyPair.privateKey, userId]);

  const addMessage = (msg) => {
    setMessages((prev) => {
      const next = [...prev, { ...msg, time: new Date().toLocaleTimeString() }];
      // scroll to bottom
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 0);
      return next;
    });
  };

  const handleSend = async () => {
    const toUserTrim = toUser.trim();
    const textTrim = text.trim();
    if (!toUserTrim || !textTrim) return;

    try {
      const resp = await fetch(`${API_BASE}/api/users/${toUserTrim}/public-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Recipient not found");
      const { devices } = await resp.json();
      const deviceIds = Object.keys(devices || {});
      if (deviceIds.length === 0) throw new Error("Recipient has no devices registered");

      // send one encrypted payload per device (fan-out)
      await Promise.all(
        deviceIds.map(async (devId) => {
          const recipientPub = devices[devId];
          const payload = await encryptMessageForPublicKey(textTrim, recipientPub, {
            from: { userId, deviceId },
            to: { userId: toUserTrim, deviceId: devId },
          });
          const outgoing = {
            type: "message",
            from: { userId, deviceId },
            to: { userId: toUserTrim, deviceId: devId },
            payload,
          };
          wsRef.current?.send(JSON.stringify(outgoing));
        }),
      );

      addMessage({
        direction: "out",
        text: textTrim,
        from: `${userId}/${deviceId}`,
        to: toUserTrim,
      });
      setText("");
    } catch (err) {
      console.error(err);
      addMessage({
        direction: "system",
        text: `Failed to send: ${err.message}`,
        from: "",
        to: "",
      });
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Left sidebar: simple header and connection status */}
      <div
        style={{
          width: 220,
          borderRight: "1px solid #ddd",
          padding: 16,
          boxSizing: "border-box",
          background: "#f7f7f7",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>MyChat</h3>
        <div style={{ fontSize: 13, color: "#555" }}>
          You: <strong>{userId}</strong>
          <br />
          Device: <strong>{deviceId}</strong>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: status === "Connected" ? "green" : "#aa0000" }}>
          Status: {status}
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
          For now, type your friend&apos;s userId &amp; deviceId once, then just chat.
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Conversation header */}
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #ddd",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, marginRight: 8 }}>Chat with:</div>
          <input
            placeholder="Friend userId (e.g. okk)"
            value={toUser}
            onChange={(e) => setToUser(e.target.value)}
            style={{ padding: 8, flex: 1, maxWidth: 260 }}
          />
        </div>

        {/* Messages list */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            padding: 16,
            overflowY: "auto",
            background: "#e5ddd5",
            boxSizing: "border-box",
          }}
        >
          {messages.map((m, idx) => {
            if (m.direction === "system") {
              return (
                <div
                  key={idx}
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    color: "#555",
                    margin: "4px 0",
                  }}
                >
                  {m.time} — {m.text}
                </div>
              );
            }
            const isOut = m.direction === "out";
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: isOut ? "flex-end" : "flex-start",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: isOut ? "#dcf8c6" : "#fff",
                    boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontSize: 10, color: "#777", marginBottom: 2 }}>
                    {isOut ? "You" : m.from} • {m.time}
                  </div>
                  <div>{m.text}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input bar */}
        <div
          style={{
            padding: 10,
            borderTop: "1px solid #ddd",
            display: "flex",
            gap: 8,
            background: "#f5f5f5",
          }}
        >
          <input
            placeholder="Type a message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          />
          <button
            onClick={handleSend}
            style={{
              padding: "8px 16px",
              borderRadius: 4,
              border: "none",
              background: "#128c7e",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
