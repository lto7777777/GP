// Main app - routes between login, chat list, and chat view
import { useState, useEffect } from "react";
import Login from "./Login";
import ChatList from "./ChatList";
import ChatView from "./ChatView";
import NewChat from "./NewChat";
import { exportPrivateKeyToPem, exportPublicKeyToPem, importPrivateKeyFromPem, importPublicKeyFromPem } from "./crypto";

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
    const publicKeyPem = localStorage.getItem("publicKeyPem");

    if (token && username && deviceId && privateKeyPem) {
      // Reconstruct keyPair from stored PEMs
      Promise.all([
        importPrivateKeyFromPem(privateKeyPem),
        publicKeyPem ? importPublicKeyFromPem(publicKeyPem) : null
      ]).then(([privateKey, publicKey]) => {
        setUser({
          token,
          username,
          deviceId,
          keyPair: { privateKey, publicKey }, // Both keys restored
        });
      }).catch((err) => {
        console.error("Failed to restore keys:", err);
        // If key import fails, clear session
        localStorage.clear();
      });
    }
  }, []);

  const handleLogin = async (userData) => {
    setUser(userData);
    // Store both keys in localStorage (in production, encrypt with passphrase)
    try {
      const [privatePem, publicPem] = await Promise.all([
        exportPrivateKeyToPem(userData.keyPair.privateKey),
        exportPublicKeyToPem(userData.keyPair.publicKey)
      ]);
      localStorage.setItem("privateKeyPem", privatePem);
      localStorage.setItem("publicKeyPem", publicPem);
    } catch (err) {
      console.error("Failed to save keys:", err);
    }
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
