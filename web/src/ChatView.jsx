// Chat view - the actual conversation screen
import { useEffect, useRef, useState } from "react";
import { decryptMessageWithPrivateKey, encryptMessageForPublicKey } from "./crypto";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const WS_URL = `${API_BASE.replace(/^https?/, API_BASE.startsWith("https") ? "wss" : "ws")}/ws`;

export default function ChatView({ user, recipientUsername, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    loadHistory();
    connectWebSocket();
    return () => {
      if (ws) ws.close();
    };
  }, [recipientUsername]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadHistory = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/conversations/${recipientUsername}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        // Decrypt all messages in history
        const decrypted = await Promise.all(
          (data.messages || []).map(async (msg) => {
            try {
              const plaintext = await decryptMessageWithPrivateKey(msg.payload, user.keyPair.privateKey);
              return {
                ...msg,
                text: plaintext,
                decrypted: true,
              };
            } catch (err) {
              return {
                ...msg,
                text: "[Unable to decrypt]",
                decrypted: false,
              };
            }
          })
        );
        setMessages(decrypted);
      }
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  const connectWebSocket = () => {
    const socket = new WebSocket(WS_URL);
    setWs(socket);

    socket.onopen = () => {
      // Identify with token and deviceId
      socket.send(
        JSON.stringify({
          type: "identify",
          token: user.token,
          deviceId: user.deviceId,
        })
      );
    };

    socket.onmessage = async (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "identified") {
          setConnected(true);
        } else if (data.type === "message.payload") {
          // Incoming encrypted message
          try {
            const plaintext = await decryptMessageWithPrivateKey(data, user.keyPair.privateKey);
            setMessages((prev) => [
              ...prev,
              {
                from: data.from?.username || "unknown",
                text: plaintext,
                timestamp: data.timestamp || Date.now(),
                decrypted: true,
              },
            ]);
          } catch (err) {
            console.error("Failed to decrypt message", err);
            setMessages((prev) => [
              ...prev,
              {
                from: data.from?.username || "unknown",
                text: "[Decryption failed]",
                timestamp: data.timestamp || Date.now(),
                decrypted: false,
              },
            ]);
          }
        }
      } catch (err) {
        console.error("Failed to process WebSocket message", err);
      }
    };

    socket.onerror = () => {
      setConnected(false);
    };

    socket.onclose = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };
  };

  const sendMessage = async () => {
    if (!text.trim() || !connected) return;

    const messageText = text.trim();
    setText("");

    try {
      // Get recipient's public keys (all devices)
      const resp = await fetch(`${API_BASE}/api/users/${recipientUsername}/public-keys`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!resp.ok) {
        alert("User not found or no devices registered");
        return;
      }

      const { devices } = await resp.json();
      const deviceIds = Object.keys(devices);

      if (deviceIds.length === 0) {
        alert("Recipient has no registered devices");
        return;
      }

      // Encrypt for each device and send
      // For simplicity, we'll encrypt once and send to all devices
      // (In production, you'd encrypt separately per device)
      const firstDeviceId = deviceIds[0];
      const payload = await encryptMessageForPublicKey(messageText, devices[firstDeviceId], {
        from: { username: user.username, deviceId: user.deviceId },
        to: { username: recipientUsername, deviceId: firstDeviceId },
      });

      // Send via WebSocket (server will fan-out to all devices)
      ws.send(
        JSON.stringify({
          type: "message",
          toUsername: recipientUsername,
          payload,
        })
      );

      // Optimistically add to UI
      setMessages((prev) => [
        ...prev,
        {
          from: user.username,
          text: messageText,
          timestamp: Date.now(),
          decrypted: true,
        },
      ]);
    } catch (err) {
      console.error("Failed to send message", err);
      alert("Failed to send message. Please try again.");
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          ←
        </button>
        <div style={styles.headerInfo}>
          <div style={styles.recipientName}>{recipientUsername}</div>
          <div style={styles.status}>
            {connected ? "🟢 Online" : "🔴 Connecting..."}
          </div>
        </div>
      </div>

      <div ref={chatContainerRef} style={styles.messages}>
        {messages.map((msg, idx) => {
          const isMe = msg.from === user.username;
          return (
            <div
              key={idx}
              style={{
                ...styles.message,
                alignSelf: isMe ? "flex-end" : "flex-start",
                alignItems: isMe ? "flex-end" : "flex-start",
              }}
            >
              <div style={{
                ...styles.messageBubble,
                backgroundColor: isMe ? "#dcf8c6" : "white",
              }}>
                {msg.text}
              </div>
              <div style={styles.messageTime}>{formatTime(msg.timestamp)}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputContainer}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
          style={styles.input}
          disabled={!connected}
        />
        <button onClick={sendMessage} style={styles.sendButton} disabled={!connected || !text.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#e5ddd5",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#075e54",
    color: "white",
  },
  backButton: {
    background: "none",
    border: "none",
    color: "white",
    fontSize: "24px",
    cursor: "pointer",
    padding: "0 12px 0 0",
  },
  headerInfo: {
    flex: 1,
  },
  recipientName: {
    fontSize: "16px",
    fontWeight: "600",
  },
  status: {
    fontSize: "12px",
    opacity: 0.9,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  message: {
    display: "flex",
    flexDirection: "column",
    maxWidth: "70%",
  },
  messageMe: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  messageOther: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  messageBubble: {
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "15px",
    wordWrap: "break-word",
    backgroundColor: "white",
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
  },
  messageTime: {
    fontSize: "11px",
    color: "#666",
    marginTop: "4px",
    padding: "0 4px",
  },
  inputContainer: {
    display: "flex",
    padding: "12px",
    backgroundColor: "white",
    borderTop: "1px solid #e0e0e0",
    gap: "8px",
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    fontSize: "15px",
    border: "1px solid #ddd",
    borderRadius: "24px",
    outline: "none",
  },
  sendButton: {
    padding: "10px 20px",
    fontSize: "15px",
    backgroundColor: "#0088cc",
    color: "white",
    border: "none",
    borderRadius: "24px",
    cursor: "pointer",
    fontWeight: "500",
  },
};

