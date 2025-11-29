// Login/Register screen with username + password
import { useState } from "react";
import { generateRSAKeyPair, exportPublicKeyToPem } from "./crypto";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password required");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // Step 1: Register or login
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || "Authentication failed");
      }

      const { token, username: loggedInUsername } = await resp.json();

      // Step 2: Generate device keypair
      const deviceId = `web-${Math.random().toString(36).slice(2, 11)}`;
      const keyPair = await generateRSAKeyPair();
      const publicPem = await exportPublicKeyToPem(keyPair.publicKey);

      // Step 3: Register device with server
      const deviceResp = await fetch(`${API_BASE}/api/devices/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId,
          publicKey: publicPem,
          deviceName: navigator.userAgent.includes("Mobile") ? "Mobile Browser" : "Desktop Browser",
        }),
      });

      if (!deviceResp.ok) {
        throw new Error("Failed to register device");
      }

      // Step 4: Store session data
      localStorage.setItem("token", token);
      localStorage.setItem("username", loggedInUsername);
      localStorage.setItem("deviceId", deviceId);
      // Store private key in memory (in production, encrypt with passphrase and store in IndexedDB)
      onLogin({
        token,
        username: loggedInUsername,
        deviceId,
        keyPair, // Keep in memory only
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>SecureChat</h1>
        <p style={styles.subtitle}>End-to-end encrypted messaging</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
            disabled={loading}
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            disabled={loading}
          />

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "..." : isRegister ? "Register" : "Login"}
          </button>
        </form>

        <button
          onClick={() => {
            setIsRegister(!isRegister);
            setError("");
          }}
          style={styles.switch}
          disabled={loading}
        >
          {isRegister ? "Already have an account? Login" : "Don't have an account? Register"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
  },
  card: {
    backgroundColor: "white",
    padding: "40px",
    borderRadius: "12px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    width: "100%",
    maxWidth: "400px",
  },
  title: {
    margin: "0 0 8px 0",
    fontSize: "28px",
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  subtitle: {
    margin: "0 0 32px 0",
    fontSize: "14px",
    color: "#666",
    textAlign: "center",
  },
  form: {
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
  switch: {
    marginTop: "16px",
    padding: "8px",
    fontSize: "14px",
    backgroundColor: "transparent",
    border: "none",
    color: "#0088cc",
    cursor: "pointer",
    textAlign: "center",
    width: "100%",
  },
  error: {
    padding: "8px 12px",
    backgroundColor: "#fee",
    color: "#c33",
    borderRadius: "6px",
    fontSize: "14px",
  },
};
