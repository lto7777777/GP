// SecureChat Server - Complete rebuild with auth, device management, and E2E encryption relay
// Now using Redis for persistent storage
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('./store');

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-use-env-variable';
const PORT = process.env.PORT || 3000;

// In-memory WebSocket connections (can't be stored in Redis)
// Maps: username -> deviceId -> WebSocket
const wsConnections = {};

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

// Helper: Get WebSocket for a device
function getDeviceWebSocket(username, deviceId) {
  if (!wsConnections[username]) return null;
  return wsConnections[username][deviceId] || null;
}

// Helper: Set WebSocket for a device
function setDeviceWebSocket(username, deviceId, ws) {
  if (!wsConnections[username]) wsConnections[username] = {};
  wsConnections[username][deviceId] = ws;
}

// Helper: Remove WebSocket for a device
function removeDeviceWebSocket(username, deviceId) {
  if (wsConnections[username]) {
    delete wsConnections[username][deviceId];
    if (Object.keys(wsConnections[username]).length === 0) {
      delete wsConnections[username];
    }
  }
}

// ========== AUTH ENDPOINTS ==========

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const exists = await store.userExists(username);
    if (exists) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    await store.createUser(username, passwordHash);
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = await store.getUser(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== DEVICE MANAGEMENT ==========

// Register device (called automatically after login)
app.post('/api/devices/register', verifyToken, async (req, res) => {
  try {
    const { deviceId, publicKey, deviceName } = req.body;
    const { username } = req.user;
    
    if (!deviceId || !publicKey) {
      return res.status(400).json({ error: 'deviceId and publicKey required' });
    }
    
    const exists = await store.userExists(username);
    if (!exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await store.registerDevice(username, deviceId, {
      publicKey,
      deviceName: deviceName || 'Unknown Device',
      registeredAt: Date.now()
    });
    
    console.log(`Device registered: ${username}/${deviceId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Device registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all devices for a user (for multi-device support)
app.get('/api/devices', verifyToken, async (req, res) => {
  try {
    const { username } = req.user;
    const devices = await store.getAllDevices(username);
    
    if (!devices) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const deviceList = Object.keys(devices).map(deviceId => ({
      deviceId,
      deviceName: devices[deviceId].deviceName,
      registeredAt: devices[deviceId].registeredAt
    }));
    
    res.json({ devices: deviceList });
  } catch (err) {
    console.error('Get devices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get public keys for a recipient (for encryption)
app.get('/api/users/:username/public-keys', verifyToken, async (req, res) => {
  try {
    const { username: recipientUsername } = req.params;
    const devices = await store.getAllDevices(recipientUsername);
    
    if (!devices) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const publicKeys = {};
    Object.keys(devices).forEach(deviceId => {
      if (devices[deviceId].publicKey) {
        publicKeys[deviceId] = devices[deviceId].publicKey;
      }
    });
    
    res.json({ devices: publicKeys });
  } catch (err) {
    console.error('Get public keys error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== MESSAGES & CONVERSATIONS ==========

// Get conversation history
app.get('/api/conversations/:otherUsername', verifyToken, async (req, res) => {
  try {
    const { username } = req.user;
    const { otherUsername } = req.params;
    const convId = getConversationId(username, otherUsername);
    const history = await store.getConversationHistory(convId);
    res.json({ messages: history });
  } catch (err) {
    console.error('Get conversation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get list of conversations (users you've chatted with)
app.get('/api/conversations', verifyToken, async (req, res) => {
  try {
    const { username } = req.user;
    const allConvIds = await store.getAllConversationIds();
    const convList = [];
    
    for (const convId of allConvIds) {
      if (convId.includes(username)) {
        const parts = convId.split('_');
        const otherUser = parts[0] === username ? parts[1] : parts[0];
        const history = await store.getConversationHistory(convId);
        const lastMsg = history[history.length - 1];
        
        if (lastMsg) {
          convList.push({
            username: otherUser,
            lastMessage: lastMsg,
            unreadCount: 0 // TODO: implement unread tracking
          });
        }
      }
    }
    
    res.json({ conversations: convList });
  } catch (err) {
    console.error('Get conversations list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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
        
        const device = await store.getDevice(username, deviceId);
        if (!device) {
          ws.send(JSON.stringify({ type: 'error', error: 'Device not registered' }));
          return;
        }
        
        // Store WebSocket connection in memory
        setDeviceWebSocket(username, deviceId, ws);
        ws.username = username;
        ws.deviceId = deviceId;
        console.log(`WS connected: ${username}/${deviceId}`);

        // Deliver queued messages for this device from Redis
        const queued = await store.getQueuedMessages(username, deviceId);
        queued.forEach(payload => {
          ws.send(JSON.stringify(payload));
        });
        
        // Clear queue after delivery
        if (queued.length > 0) {
          await store.clearQueuedMessages(username, deviceId);
        }
        
        ws.send(JSON.stringify({ type: 'identified', status: 'ok' }));
      } catch (err) {
        console.error('WS identify error:', err);
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

      try {
        const recipientDevices = await store.getAllDevices(toUsername);
        if (!recipientDevices || Object.keys(recipientDevices).length === 0) {
          ws.send(JSON.stringify({ type: 'error', error: 'Recipient not found' }));
          return;
        }

        // Store in conversation history (encrypted blob)
        const convId = getConversationId(ws.username, toUsername);
        await store.addMessage(convId, {
          from: ws.username,
          to: toUsername,
          payload, // encrypted payload (for recipient only)
          timestamp: Date.now()
        });

        // Fan-out: send to ALL recipient's devices
        let deliveredCount = 0;
        const deviceIds = Object.keys(recipientDevices);
        
        for (const deviceId of deviceIds) {
          const recipientWs = getDeviceWebSocket(toUsername, deviceId);
          
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(JSON.stringify(payload));
            deliveredCount++;
          } else {
            // Queue for offline delivery in Redis
            await store.queueMessage(toUsername, deviceId, payload);
          }
        }

        // Confirm to sender
        ws.send(JSON.stringify({
          type: 'message-sent',
          to: toUsername,
          deliveredTo: deliveredCount
        }));
      } catch (err) {
        console.error('Message send error:', err);
        ws.send(JSON.stringify({ type: 'error', error: 'Failed to send message' }));
      }
      return;
    }

    console.log('Unknown message type:', msg.type);
  });

  ws.on('close', () => {
    if (ws.username && ws.deviceId) {
      removeDeviceWebSocket(ws.username, ws.deviceId);
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

// Initialize Redis connection and start server
async function start() {
  try {
    await store.connect();
    server.listen(PORT, () => {
      console.log(`🚀 SecureChat Server running on port ${PORT}`);
      console.log(`📡 REST API: http://localhost:${PORT}/api`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
      console.log(`💾 Storage: Redis (${process.env.REDIS_URL || 'redis://localhost:6379'})`);
      console.log(`\nEndpoints:`);
      console.log(`  POST /api/auth/register`);
      console.log(`  POST /api/auth/login`);
      console.log(`  POST /api/devices/register`);
      console.log(`  GET  /api/users/:username/public-keys`);
      console.log(`  GET  /api/conversations`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    console.error('Make sure Redis is running: redis-server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await store.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await store.disconnect();
  process.exit(0);
});

start();

