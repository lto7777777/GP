// Redis storage adapter for SecureChat
const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisStore {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    
    try {
      this.client = createClient({ url: REDIS_URL });
      
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('🔌 Redis connecting...');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis connected and ready');
        this.connected = true;
      });

      await this.client.connect();
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      throw err;
    }
  }

  // ========== USER OPERATIONS ==========

  async getUser(username) {
    const data = await this.client.get(`user:${username}`);
    return data ? JSON.parse(data) : null;
  }

  async createUser(username, passwordHash) {
    const user = {
      passwordHash,
      devices: {}
    };
    await this.client.set(`user:${username}`, JSON.stringify(user));
    return user;
  }

  async userExists(username) {
    const exists = await this.client.exists(`user:${username}`);
    return exists === 1;
  }

  // ========== DEVICE OPERATIONS ==========

  async registerDevice(username, deviceId, deviceData) {
    const user = await this.getUser(username);
    if (!user) throw new Error('User not found');
    
    user.devices = user.devices || {};
    user.devices[deviceId] = {
      ...deviceData,
      registeredAt: deviceData.registeredAt || Date.now()
    };
    
    await this.client.set(`user:${username}`, JSON.stringify(user));
    return user.devices[deviceId];
  }

  async getDevice(username, deviceId) {
    const user = await this.getUser(username);
    if (!user || !user.devices) return null;
    return user.devices[deviceId] || null;
  }

  async getAllDevices(username) {
    const user = await this.getUser(username);
    if (!user || !user.devices) return {};
    return user.devices;
  }

  async updateDeviceWebSocket(username, deviceId, ws) {
    // WebSocket objects can't be serialized, so we store a reference separately
    // This is kept in memory, but device metadata is in Redis
    // The actual ws reference is managed by the server's in-memory map
    const user = await this.getUser(username);
    if (!user || !user.devices || !user.devices[deviceId]) {
      return false;
    }
    // Device exists in Redis, ws reference is handled by server
    return true;
  }

  // ========== CONVERSATION OPERATIONS ==========

  async addMessage(convId, message) {
    const key = `conv:${convId}`;
    await this.client.lPush(key, JSON.stringify(message));
    // Keep last 1000 messages per conversation (optional cleanup)
    await this.client.lTrim(key, 0, 999);
  }

  async getConversationHistory(convId) {
    const key = `conv:${convId}`;
    const messages = await this.client.lRange(key, 0, -1);
    // Reverse to get chronological order (oldest first) since we use lPush
    return messages.reverse().map(msg => JSON.parse(msg));
  }

  async getAllConversationIds() {
    const keys = await this.client.keys('conv:*');
    return keys.map(key => key.replace('conv:', ''));
  }

  // ========== MESSAGE QUEUE OPERATIONS (for offline delivery) ==========

  async queueMessage(username, deviceId, payload) {
    const key = `queue:${username}:${deviceId}`;
    await this.client.lPush(key, JSON.stringify(payload));
  }

  async getQueuedMessages(username, deviceId) {
    const key = `queue:${username}:${deviceId}`;
    const messages = await this.client.lRange(key, 0, -1);
    return messages.map(msg => JSON.parse(msg));
  }

  async clearQueuedMessages(username, deviceId) {
    const key = `queue:${username}:${deviceId}`;
    await this.client.del(key);
  }

  // ========== UTILITY ==========

  async disconnect() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

// Export singleton instance
const store = new RedisStore();

module.exports = store;

