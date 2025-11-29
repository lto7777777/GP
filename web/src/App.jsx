// Main app - routes between login, chat list, and chat view
import { useState, useEffect } from "react";
import Login from "./Login";
import ChatList from "./ChatList";
import ChatView from "./ChatView";
import NewChat from "./NewChat";
import { exportPrivateKeyToPem, importPrivateKeyFromPem } from "./crypto";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("list"); // 'list', 'chat', 'new'
  const [selectedChat, setSelectedChat] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const deviceId = localStorage.getItem("deviceId");
    const privateKeyPem = localStorage.getItem("privateKeyPem");

    if (token && username && deviceId && privateKeyPem) {
      // Reconstruct keyPair from stored PEM
      importPrivateKeyFromPem(privateKeyPem).then((privateKey) => {
        // We need to get the public key from server or regenerate
        // For now, we'll just set a placeholder - in production, store both keys encrypted
        setUser({
          token,
          username,
          deviceId,
          keyPair: { privateKey }, // Public key will be fetched when needed
        });
      }).catch(() => {
        // If key import fails, clear session
        localStorage.clear();
      });
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    // Store private key PEM in localStorage (in production, encrypt with passphrase)
    exportPrivateKeyToPem(userData.keyPair.privateKey).then((pem) => {
      localStorage.setItem("privateKeyPem", pem);
    });
    setView("list");
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setView("list");
    setSelectedChat(null);
  };

  const handleSelectChat = (username) => {
    setSelectedChat(username);
    setView("chat");
  };

  const handleNewChat = () => {
    setView("new");
  };

  const handleStartChat = (username) => {
    setSelectedChat(username);
    setView("chat");
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (view === "new") {
    return <NewChat user={user} onStartChat={handleStartChat} onBack={() => setView("list")} />;
  }

  if (view === "chat" && selectedChat) {
    return (
      <ChatView
        user={user}
        recipientUsername={selectedChat}
        onBack={() => setView("list")}
      />
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <ChatList
        user={user}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />
      <div style={{ padding: "20px", backgroundColor: "#f8f9fa", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#666" }}>
          <p>Select a chat or start a new conversation</p>
          <button
            onClick={handleLogout}
            style={{
              marginTop: "20px",
              padding: "8px 16px",
              backgroundColor: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
