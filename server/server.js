// SecureChat Server - Complete rebuild with auth, device management, and E2E encryption relay
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-use-env-variable';
const PORT = process.env.PORT || 3000;

// In-memory stores (replace with MongoDB/PostgreSQL in production)
const users = {};        // username -> { passwordHash, devices: { deviceId: { publicKey, deviceName, ws } } }
const messages = [];     // queued encrypted messages for offline delivery
const conversations = {}; // conversationId -> [message objects] for history

// Helper: Generate conversation ID between two users
function getConversationId(user1, user2) {
  return [user1, user2].sort().join('_');
}

// Helper: Verify JWT token
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ========== AUTH ENDPOINTS ==========

// Register new user
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (users[username]) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users[username] = { passwordHash, devices: {} };
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = users[username];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

// ========== DEVICE MANAGEMENT ==========

// Register device (called automatically after login)
app.post('/api/devices/register', verifyToken, (req, res) => {
  const { deviceId, publicKey, deviceName } = req.body;
  const { username } = req.user;
  if (!deviceId || !publicKey) {
    return res.status(400).json({ error: 'deviceId and publicKey required' });
  }
  if (!users[username]) {
    return res.status(404).json({ error: 'User not found' });
  }
  users[username].devices[deviceId] = {
    publicKey,
    deviceName: deviceName || 'Unknown Device',
    registeredAt: Date.now(),
    ws: null
  };
  console.log(`Device registered: ${username}/${deviceId}`);
  res.json({ ok: true });
});

// Get all devices for a user (for multi-device support)
app.get('/api/devices', verifyToken, (req, res) => {
  const { username } = req.user;
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  const deviceList = Object.keys(user.devices).map(deviceId => ({
    deviceId,
    deviceName: user.devices[deviceId].deviceName,
    registeredAt: user.devices[deviceId].registeredAt
  }));
  res.json({ devices: deviceList });
});

// Get public keys for a recipient (for encryption)
app.get('/api/users/:username/public-keys', verifyToken, (req, res) => {
  const { username: recipientUsername } = req.params;
  const user = users[recipientUsername];
  if (!user) return res.status(404).json({ error: 'User not found' });
  const devices = {};
  Object.keys(user.devices).forEach(deviceId => {
    if (user.devices[deviceId].publicKey) {
      devices[deviceId] = user.devices[deviceId].publicKey;
    }
  });
  res.json({ devices });
});

// ========== MESSAGES & CONVERSATIONS ==========

// Get conversation history
app.get('/api/conversations/:otherUsername', verifyToken, (req, res) => {
  const { username } = req.user;
  const { otherUsername } = req.params;
  const convId = getConversationId(username, otherUsername);
  const history = conversations[convId] || [];
  res.json({ messages: history });
});

// Get list of conversations (users you've chatted with)
app.get('/api/conversations', verifyToken, (req, res) => {
  const { username } = req.user;
  const convList = [];
  Object.keys(conversations).forEach(convId => {
    if (convId.includes(username)) {
      const parts = convId.split('_');
      const otherUser = parts[0] === username ? parts[1] : parts[0];
      const lastMsg = conversations[convId][conversations[convId].length - 1];
      if (lastMsg) {
        convList.push({
          username: otherUser,
          lastMessage: lastMsg,
          unreadCount: 0 // TODO: implement unread tracking
        });
      }
    }
  });
  res.json({ conversations: convList });
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ========== WEBSOCKET SERVER ==========

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      console.warn('Invalid message JSON', e);
      return;
    }

    // Identify: connect device to WebSocket
    if (msg.type === 'identify') {
      const { token, deviceId } = msg;
      if (!token || !deviceId) {
        ws.send(JSON.stringify({ type: 'error', error: 'token and deviceId required' }));
        return;
      }
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { username } = decoded;
        if (!users[username] || !users[username].devices[deviceId]) {
          ws.send(JSON.stringify({ type: 'error', error: 'Device not registered' }));
          return;
        }
        users[username].devices[deviceId].ws = ws;
        ws.username = username;
        ws.deviceId = deviceId;
        console.log(`WS connected: ${username}/${deviceId}`);

        // Deliver queued messages for this device
        const pending = messages.filter(m => 
          m.to.username === username && m.to.deviceId === deviceId
        );
        pending.forEach(m => {
          ws.send(JSON.stringify(m.payload));
        });
        // Remove delivered messages
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].to.username === username && messages[i].to.deviceId === deviceId) {
            messages.splice(i, 1);
          }
        }
        ws.send(JSON.stringify({ type: 'identified', status: 'ok' }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid token' }));
      }
      return;
    }

    // Send message: automatically fan-out to all recipient's devices
    if (msg.type === 'message') {
      const { toUsername, payload } = msg;
      if (!toUsername || !payload || !ws.username) {
        return;
      }

      const recipient = users[toUsername];
      if (!recipient) {
        ws.send(JSON.stringify({ type: 'error', error: 'Recipient not found' }));
        return;
      }

      // Store in conversation history (encrypted blob)
      const convId = getConversationId(ws.username, toUsername);
      if (!conversations[convId]) conversations[convId] = [];
      conversations[convId].push({
        from: ws.username,
        to: toUsername,
        payload, // encrypted payload
        timestamp: Date.now()
      });

      // Fan-out: send to ALL recipient's devices
      let deliveredCount = 0;
      Object.keys(recipient.devices).forEach(deviceId => {
        const device = recipient.devices[deviceId];
        if (device.ws && device.ws.readyState === WebSocket.OPEN) {
          device.ws.send(JSON.stringify(payload));
          deliveredCount++;
        } else {
          // Queue for offline delivery
          messages.push({
            to: { username: toUsername, deviceId },
            payload
          });
        }
      });

      // Confirm to sender
      ws.send(JSON.stringify({
        type: 'message-sent',
        to: toUsername,
        deliveredTo: deliveredCount
      }));
      return;
    }

    console.log('Unknown message type:', msg.type);
  });

  ws.on('close', () => {
    if (ws.username && ws.deviceId && users[ws.username] && users[ws.username].devices[ws.deviceId]) {
      users[ws.username].devices[ws.deviceId].ws = null;
      console.log(`WS disconnected: ${ws.username}/${ws.deviceId}`);
    }
  });
});

// Ping-pong to detect dead connections
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => {
  console.log(`🚀 SecureChat Server running on port ${PORT}`);
  console.log(`📡 REST API: http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/auth/register`);
  console.log(`  POST /api/auth/login`);
  console.log(`  POST /api/devices/register`);
  console.log(`  GET  /api/users/:username/public-keys`);
  console.log(`  GET  /api/conversations`);
});
