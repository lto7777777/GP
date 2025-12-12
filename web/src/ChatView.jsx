// Chat view - the actual conversation screen
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

export default function ChatView({ user, recipientUsername, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [disappearingEnabled, setDisappearingEnabled] = useState(false);
  const [disappearTime, setDisappearTime] = useState(5); // seconds
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const messageTimersRef = useRef({}); // Track timers for disappearing messages

  useEffect(() => {
    if (user && user.keyPair && user.keyPair.privateKey) {
      loadHistory();
      connectWebSocket();
    }
    return () => {
      if (ws) ws.close();
      // Clear all timers when leaving chat
      Object.values(messageTimersRef.current).forEach(timer => clearTimeout(timer));
      messageTimersRef.current = {};
    };
  }, [recipientUsername, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle disappearing messages - set timers for all messages when enabled
  useEffect(() => {
    if (!disappearingEnabled) {
      // Clear all timers if disabled
      Object.values(messageTimersRef.current).forEach(timer => clearTimeout(timer));
      messageTimersRef.current = {};
      return;
    }

    // Set timers for all current messages that don't have one yet
    messages.forEach((msg) => {
      if (msg.id && msg.timestamp && !messageTimersRef.current[msg.id]) {
        const elapsed = Date.now() - msg.timestamp;
        const remaining = (disappearTime * 1000) - elapsed;
        
        if (remaining > 0) {
          const timerId = setTimeout(() => {
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== msg.id);
              // Also remove from localStorage if it's a sent message
              if (msg.isSent) {
                const sentMessagesKey = `sent_messages_${user.username}_${recipientUsername}`;
                const stored = JSON.parse(localStorage.getItem(sentMessagesKey) || '[]');
                const filteredStored = stored.filter(m => m.id !== msg.id);
                localStorage.setItem(sentMessagesKey, JSON.stringify(filteredStored));
              }
              return filtered;
            });
            delete messageTimersRef.current[msg.id];
          }, remaining);
          messageTimersRef.current[msg.id] = timerId;
        } else {
          // Message already expired, remove immediately
          setMessages(prev => prev.filter(m => m.id !== msg.id));
        }
      }
    });

    return () => {
      // Cleanup timers when component unmounts or dependencies change
      // But don't clear if we're just updating - let timers run
    };
  }, [disappearingEnabled, disappearTime, messages.length]); // Re-run when messages count changes

  const loadHistory = async () => {
    try {
      if (!user || !user.keyPair || !user.keyPair.privateKey) {
        console.error("No private key available for decryption");
        return;
      }

      // Load sent messages from localStorage
      const sentMessagesKey = `sent_messages_${user.username}_${recipientUsername}`;
      const sentMessages = JSON.parse(localStorage.getItem(sentMessagesKey) || '[]');

      const resp = await fetch(`${API_BASE}/api/conversations/${recipientUsername}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        const allMessages = [];
        
        // Process messages from server
        for (const msg of (data.messages || [])) {
          const isFromMe = msg.from === user.username;
          
          if (isFromMe) {
            // Message we sent - get plaintext from localStorage
            const sentMsg = sentMessages.find(m => 
              Math.abs(m.timestamp - (msg.timestamp || 0)) < 1000 // Match within 1 second
            );
            if (sentMsg) {
              allMessages.push({
                ...msg,
                text: sentMsg.text,
                decrypted: true,
                id: sentMsg.id || `${msg.timestamp || Date.now()}-${Math.random()}`,
                isSent: true,
              });
            }
            // If not found in localStorage, skip it (can't decrypt)
          } else {
            // Message sent TO us - decrypt with our private key
            try {
              if (!msg.payload || !msg.payload.wrappedKey) {
                console.error("Invalid payload structure:", msg);
                continue;
              }
              const plaintext = await decryptMessageWithPrivateKey(msg.payload, user.keyPair.privateKey);
              allMessages.push({
                ...msg,
                text: plaintext,
                decrypted: true,
                id: `${msg.timestamp || Date.now()}-${Math.random()}`,
              });
            } catch (err) {
              console.error("Decryption error:", err);
              allMessages.push({
                ...msg,
                text: "[Unable to decrypt]",
                decrypted: false,
                id: `${msg.timestamp || Date.now()}-${Math.random()}`,
              });
            }
          }
        }
        
        // Sort by timestamp
        allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setMessages(allMessages);
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
            if (!user.keyPair || !user.keyPair.privateKey) {
              throw new Error("No private key available");
            }
            if (!data.wrappedKey || !data.iv || !data.ciphertext) {
              throw new Error("Invalid message format");
            }
            const plaintext = await decryptMessageWithPrivateKey(data, user.keyPair.privateKey);
            const timestamp = data.timestamp || Date.now();
            const newMsg = {
              from: data.from?.username || "unknown",
              text: plaintext,
              timestamp,
              decrypted: true,
              id: `${timestamp}-${Math.random()}`, // Unique ID
            };
            setMessages((prev) => {
              const updated = [...prev, newMsg];
              // Set timer for disappearing message if enabled
              if (disappearingEnabled) {
                messageTimersRef.current[newMsg.id] = setTimeout(() => {
                  setMessages(current => {
                    const filtered = current.filter(m => m.id !== newMsg.id);
                    // Also remove from server history if possible (optional)
                    return filtered;
                  });
                  delete messageTimersRef.current[newMsg.id];
                }, disappearTime * 1000);
              }
              return updated;
            });
          } catch (err) {
            console.error("Failed to decrypt message", err);
            setMessages((prev) => [
              ...prev,
              {
                from: data.from?.username || "unknown",
                text: "[Decryption failed]",
                timestamp: data.timestamp || Date.now(),
                decrypted: false,
                id: `${Date.now()}-${Math.random()}`,
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

      // Optimistically add to UI (we know the plaintext since we just sent it)
      const timestamp = Date.now();
      const newMsg = {
        from: user.username,
        text: messageText,
        timestamp,
        decrypted: true,
        id: `${timestamp}-${Math.random()}`, // Unique ID
        isSent: true,
      };
      
      // Store in localStorage for persistence across reloads
      const sentMessagesKey = `sent_messages_${user.username}_${recipientUsername}`;
      const existing = JSON.parse(localStorage.getItem(sentMessagesKey) || '[]');
      existing.push({ timestamp, text: messageText, id: newMsg.id });
      localStorage.setItem(sentMessagesKey, JSON.stringify(existing));
      
      setMessages((prev) => {
        const updated = [...prev, newMsg];
        // Set timer for disappearing message if enabled
        if (disappearingEnabled) {
          const timerId = setTimeout(() => {
            setMessages(current => {
              const filtered = current.filter(m => m.id !== newMsg.id);
              // Also remove from localStorage
              const stored = JSON.parse(localStorage.getItem(sentMessagesKey) || '[]');
              const filteredStored = stored.filter(m => m.id !== newMsg.id);
              localStorage.setItem(sentMessagesKey, JSON.stringify(filteredStored));
              return filtered;
            });
            delete messageTimersRef.current[newMsg.id];
          }, disappearTime * 1000);
          messageTimersRef.current[newMsg.id] = timerId;
        }
        return updated;
      });
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
        <div style={styles.headerControls}>
          <label style={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={disappearingEnabled}
              onChange={(e) => {
                setDisappearingEnabled(e.target.checked);
                if (!e.target.checked) {
                  // Clear all timers when disabled
                  Object.values(messageTimersRef.current).forEach(timer => clearTimeout(timer));
                  messageTimersRef.current = {};
                }
              }}
              style={styles.toggle}
            />
            <span style={styles.toggleText}>Disappearing</span>
          </label>
          {disappearingEnabled && (
            <select
              value={disappearTime}
              onChange={(e) => setDisappearTime(Number(e.target.value))}
              style={styles.timeSelect}
            >
              <option value={5}>5 sec</option>
              <option value={10}>10 sec</option>
              <option value={30}>30 sec</option>
              <option value={60}>1 min</option>
              <option value={300}>5 min</option>
            </select>
          )}
        </div>
      </div>

      <div ref={chatContainerRef} style={styles.messages}>
        {messages.map((msg) => {
          const isMe = msg.from === user.username;
          return (
            <div
              key={msg.id || msg.timestamp}
              style={{
                ...styles.message,
                alignSelf: isMe ? "flex-end" : "flex-start",
                alignItems: isMe ? "flex-end" : "flex-start",
              }}
            >
              <div style={{
                ...styles.messageBubble,
                backgroundColor: isMe ? "#dcf8c6" : "white",
                opacity: disappearingEnabled ? 0.95 : 1,
              }}>
                {msg.text}
                {disappearingEnabled && (
                  <span style={styles.disappearIcon}> ⏱️</span>
                )}
              </div>
              <div style={styles.messageTime}>
                {formatTime(msg.timestamp)}
                {disappearingEnabled && msg.timestamp && (
                  <span style={styles.timeRemaining}>
                    {" "}• {Math.max(0, Math.ceil((disappearTime * 1000 - (Date.now() - msg.timestamp)) / 1000))}s
                  </span>
                )}
              </div>
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
  headerControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "13px",
  },
  toggle: {
    cursor: "pointer",
  },
  toggleText: {
    userSelect: "none",
  },
  timeSelect: {
    padding: "4px 8px",
    fontSize: "12px",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "white",
    cursor: "pointer",
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
  disappearIcon: {
    fontSize: "12px",
    marginLeft: "4px",
  },
  timeRemaining: {
    fontSize: "10px",
    color: "#999",
    fontStyle: "italic",
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

