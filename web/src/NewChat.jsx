// New chat screen - start conversation with a username
import { useState } from "react";

export default function NewChat({ user, onStartChat, onBack }) {
  const [username, setUsername] = useState("");

  const handleStart = () => {
    if (username.trim()) {
      onStartChat(username.trim());
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          ←
        </button>
        <h2 style={styles.title}>New Chat</h2>
      </div>

      <div style={styles.content}>
        <input
          type="text"
          placeholder="Enter username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
          style={styles.input}
          autoFocus
        />
        <button onClick={handleStart} style={styles.button} disabled={!username.trim()}>
          Start Chat
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
    backgroundColor: "#f8f9fa",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "16px 20px",
    backgroundColor: "white",
    borderBottom: "1px solid #e0e0e0",
  },
  backButton: {
    background: "none",
    border: "none",
    fontSize: "24px",
    cursor: "pointer",
    padding: "0 12px 0 0",
  },
  title: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "600",
  },
  content: {
    padding: "40px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  input: {
    padding: "12px 16px",
    fontSize: "16px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    outline: "none",
  },
  button: {
    padding: "12px",
    fontSize: "16px",
    fontWeight: "600",
    backgroundColor: "#0088cc",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
};

