// Chat list screen - shows all conversations
import { useEffect, useState } from "react";

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

export default function ChatList({ user, onSelectChat, onNewChat }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/conversations`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to load conversations", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Chats</h2>
        <button onClick={onNewChat} style={styles.newButton}>
          + New Chat
        </button>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : conversations.length === 0 ? (
        <div style={styles.empty}>
          <p>No conversations yet</p>
          <button onClick={onNewChat} style={styles.emptyButton}>
            Start a new chat
          </button>
        </div>
      ) : (
        <div style={styles.list}>
          {conversations.map((conv) => (
            <div
              key={conv.username}
              onClick={() => onSelectChat(conv.username)}
              style={styles.item}
            >
              <div style={styles.avatar}>{conv.username[0].toUpperCase()}</div>
              <div style={styles.content}>
                <div style={styles.name}>{conv.username}</div>
                <div style={styles.preview}>
                  {conv.lastMessage?.from === user.username ? "You: " : ""}
                  {/* Message preview would show decrypted text, but for now just show indicator */}
                  🔒 Encrypted message
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#f8f9fa",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    backgroundColor: "white",
    borderBottom: "1px solid #e0e0e0",
  },
  title: {
    margin: 0,
    fontSize: "24px",
    fontWeight: "600",
    color: "#333",
  },
  newButton: {
    padding: "8px 16px",
    fontSize: "14px",
    backgroundColor: "#0088cc",
    color: "white",
    border: "none",
    borderRadius: "20px",
    cursor: "pointer",
    fontWeight: "500",
  },
  loading: {
    padding: "40px",
    textAlign: "center",
    color: "#666",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    color: "#666",
  },
  emptyButton: {
    marginTop: "16px",
    padding: "10px 20px",
    fontSize: "14px",
    backgroundColor: "#0088cc",
    color: "white",
    border: "none",
    borderRadius: "20px",
    cursor: "pointer",
  },
  list: {
    flex: 1,
    overflowY: "auto",
  },
  item: {
    display: "flex",
    alignItems: "center",
    padding: "12px 20px",
    backgroundColor: "white",
    borderBottom: "1px solid #f0f0f0",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  avatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "#0088cc",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    fontWeight: "600",
    marginRight: "12px",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: "16px",
    fontWeight: "500",
    color: "#333",
    marginBottom: "4px",
  },
  preview: {
    fontSize: "14px",
    color: "#666",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};

