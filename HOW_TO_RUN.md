# 🚀 How to Run the Encrypted Messenger App (With docker compose)

## Prerequirements

Make sure docker and docker compose are up to date

## Run

In this directory, run:
```bash
docker compose up
```

# 🚀 How to Run the Encrypted Messenger App (Without docker compose)

## Prerequisites

Before you begin, make sure you have:
- ✅ **Node.js** installed (v14 or higher) - [Download here](https://nodejs.org/)
- ✅ **npm** installed (comes with Node.js)
- ✅ **Redis** installed and running - [Download here](https://redis.io/download) or use Docker:
  ```bash
  docker run -d -p 6379:6379 redis:alpine
  ```
- ✅ **Git** (to clone the repository)

---

## Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd <repository-name>
```

Replace `<your-repo-url>` with your actual repository URL and `<repository-name>` with the folder name.

**Note:** After cloning, you will NOT have `node_modules/` folders. This is normal! They are excluded from Git (via `.gitignore`) because they're huge and can be recreated. You'll install them in the next steps.

---

## Step 2: Install Backend Dependencies ⚠️ REQUIRED

**⚠️ CRITICAL:** The `node_modules/` folder does NOT exist after cloning. You **MUST** run `npm install` before starting the server, or you'll get errors like "Cannot find module 'express'".

Open a terminal/command prompt and navigate to the server directory:

```bash
cd server
npm install
```

**What this does:**
- Reads `package.json` to see what packages are needed
- Downloads all dependencies from npm (this may take 1-2 minutes)
- Creates the `node_modules/` folder automatically
- **This is REQUIRED - the app will NOT work without it!**

**Expected output:** You'll see a list of packages being installed, ending with something like:
```
added 148 packages, and audited 149 packages in 45s
```

This will install all required packages:
- `express` - Web server
- `ws` - WebSocket server
- `redis` - Redis client
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication
- And other dependencies...

---

## Step 3: Start Redis (if not already running)

**Option A: Using Docker (Recommended)**
```bash
docker run -d -p 6379:6379 redis:alpine
```

**Option B: Using Redis installed locally**
```bash
# On Windows (if installed via WSL or native)
redis-server

# On macOS (if installed via Homebrew)
brew services start redis

# On Linux
sudo systemctl start redis
# or
redis-server
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

---

## Step 4: Start the Backend Server

In the same terminal (still in the `server` directory):

```bash
npm start
```

**Expected output:**
```
🔌 Redis connecting...
✅ Redis connected and ready
🚀 SecureChat Server running on port 3000
📡 REST API: http://localhost:3000/api
🔌 WebSocket: ws://localhost:3000/ws
💾 Storage: Redis (redis://localhost:6379)
```

**Keep this terminal window open!** The server must stay running.

**Note:** If you need to use a different Redis URL, set the environment variable:
```bash
# Windows (PowerShell)
$env:REDIS_URL="redis://your-redis-host:6379"
npm start

# Windows (Command Prompt)
set REDIS_URL=redis://your-redis-host:6379
npm start

# macOS/Linux
REDIS_URL=redis://your-redis-host:6379 npm start
```

---

## Step 5: Install Frontend Dependencies ⚠️ REQUIRED

**⚠️ CRITICAL:** Just like the backend, the `node_modules/` folder does NOT exist. You **MUST** run `npm install` here too, or the frontend won't work!

Open a **NEW** terminal window and navigate to the web directory:

```bash
cd web
npm install
```

**What this does:**
- Reads `package.json` to see what packages are needed
- Downloads all dependencies from npm (this may take 1-2 minutes)
- Creates the `node_modules/` folder automatically
- **This is REQUIRED - the frontend will NOT work without it!**

**Expected output:** You'll see a list of packages being installed, ending with something like:
```
added 157 packages, and audited 158 packages in 30s
```

This will install:
- `react` & `react-dom` - UI framework
- `node-forge` - Crypto fallback for HTTP
- `vite` - Build tool
- And other dependencies...

---

## Step 6: Start the Web Client

In the same terminal (still in the `web` directory):

```bash
npm run dev
```

**Expected output:**
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Keep this terminal window open too!**

---

## Step 7: Open the App in Your Browser

1. Open your browser and go to: **http://localhost:5173**
2. You should see the login/register screen

---

## Step 8: Test the App (Two Users)

### User 1 (Alice):
1. Click **"Don't have an account? Register"**
2. Enter:
   - Username: `alice`
   - Password: `password123`
3. Click **"Register"**
4. You'll be logged in automatically and see the chat list

### User 2 (Bob):
1. Open a **new browser window** (or incognito/private window)
2. Go to: **http://localhost:5173**
3. Click **"Don't have an account? Register"**
4. Enter:
   - Username: `bob`
   - Password: `password123`
5. Click **"Register"**

### Start Chatting:
1. In **Alice's window**: Click **"+ New Chat"** button
2. Enter username: `bob`
3. Click **"Start Chat"**
4. Type a message and press Enter
5. Switch to **Bob's window** - you should see the message appear instantly! 🎉

---

## 🎯 Quick Commands Summary

**⚠️ IMPORTANT:** Run `npm install` in both directories BEFORE starting the servers!

### Terminal 1 (Backend):
```bash
cd server
npm install    # ⚠️ REQUIRED - Run this FIRST!
npm start
```

### Terminal 2 (Frontend):
```bash
cd web
npm install    # ⚠️ REQUIRED - Run this FIRST!
npm run dev
```

### Terminal 3 (Redis - if not using Docker):
```bash
redis-server
```

**Note:** If you see errors like "Cannot find module", it means you forgot to run `npm install`. Go back and run it!

---

## 🔧 Troubleshooting

### ❌ "Cannot find module 'express'" or "Cannot find module 'react'"
- ⚠️ **You forgot to run `npm install`!**
- Go to the directory (`server/` or `web/`) and run: `npm install`
- Wait for installation to complete (1-2 minutes)
- Then try starting the app again

### ❌ "npm is not recognized"
- Make sure Node.js is installed: `node --version`
- Try using the full path: `C:\Program Files\nodejs\npm.cmd install`
- Or restart your terminal after installing Node.js

### ❌ "Port 3000 already in use"
- Another app is using port 3000
- Close that app or change the port:
  ```bash
  # Windows (PowerShell)
  $env:PORT=3001
  npm start
  
  # macOS/Linux
  PORT=3001 npm start
  ```

### ❌ "Cannot connect to Redis"
- Make sure Redis is running: `redis-cli ping`
- Check Redis URL in environment variables
- If using Docker, verify container is running: `docker ps`

### ❌ "Cannot connect to server"
- Make sure the backend server is running (Terminal 1)
- Check that it says "✅ Redis connected and ready"
- Verify it says "Server running on port 3000"

### ❌ "WebSocket connection failed"
- Backend server must be running first
- Check browser console (F12) for errors
- Make sure both servers are running
- Verify Redis is connected (check backend terminal)

### ❌ "Web Crypto API is not available"
- This happens when accessing via HTTP from a non-localhost address
- Solution: Use `http://localhost:5173` instead of your IP address
- Or enable HTTPS (the app has a fallback, but localhost is recommended)

### ❌ PowerShell Script Errors
- **Use Command Prompt instead** (cmd.exe)
- Or use Git Bash
- PowerShell has security restrictions that block npm scripts
- Or run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

---

## 📝 Important Notes

- **Redis Required:** This version uses Redis for persistent storage. Data survives server restarts!
- **No MongoDB needed:** Redis handles all data storage
- **Messages are encrypted:** Even the server can't read them (end-to-end encryption)
- **Data persists:** Unlike in-memory storage, your data is saved in Redis
- **Multi-device support:** Each device has its own encryption keys
- **Disappearing messages:** Toggle in chat view with timer options

---

## 🌐 Running on Local Network (LAN)

To access from other devices on your network:

### Backend:
```bash
# The server already listens on 0.0.0.0 by default
# Just make sure firewall allows port 3000
```

### Frontend:
```bash
cd web
npm run dev -- --host 0.0.0.0
```

Then access from other devices using your computer's IP:
- `http://YOUR_IP_ADDRESS:5173`

**Note:** For non-localhost access, you may see "Web Crypto API is not available" warning. The app has a fallback, but for best security, use HTTPS or localhost.

---

## 🎉 Success Indicators

✅ Backend terminal shows: `✅ Redis connected and ready`  
✅ Backend terminal shows: `🚀 SecureChat Server running on port 3000`  
✅ Frontend terminal shows: `Local: http://localhost:5173/`  
✅ Browser shows login/register screen  
✅ You can register and login  
✅ You can send messages between users  
✅ Messages appear in real-time  
✅ Data persists after server restart (thanks to Redis!)

---

## 🚀 Next Steps

- Deploy backend to Heroku/Railway/Render (with Redis addon)
- Deploy frontend to GitHub Pages/Vercel/Netlify
- Build mobile app with React Native
- Add file attachments with encryption
- Add group chats
- Add read receipts

---

## 📚 Development Mode

For development with auto-reload:

**Backend:**
```bash
cd server
npm run dev  # Uses nodemon for auto-reload
```

**Frontend:**
```bash
cd web
npm run dev  # Vite has hot-reload by default
```

---

## 🐳 Docker Compose (Optional)

Create a `docker-compose.yml` in the root directory:

```yaml
version: '3.8'
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
  
  server:
    build: ./server
    ports:
      - "3000:3000"
    depends_on:
      - redis
    environment:
      - REDIS_URL=redis://redis:6379
```

Then run:
```bash
docker-compose up
```

---

**Happy Chatting! 🔒💬**
