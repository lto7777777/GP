# 🚀 How to Run the Encrypted Messenger App

## Step-by-Step Instructions

### Prerequisites
- ✅ Node.js installed (v14 or higher)
- ✅ npm installed (comes with Node.js)
- ✅ Two browser windows/tabs (to test with two users)

---

## Step 1: Start the Backend Server

Open **Command Prompt** (not PowerShell) or **Git Bash**:

```bash
cd "D:\smthing stupid\GP\server"
npm install
npm start
```

**Expected output:**
```
Server running on http://localhost:3000
WebSocket server ready
```

**Keep this terminal window open!** The server must stay running.

---

## Step 2: Start the Web Client (in a NEW terminal)

Open a **NEW** Command Prompt or Git Bash window:

```bash
cd "D:\smthing stupid\GP\web"
npm install
npm run dev
```

**Expected output:**
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## Step 3: Open the App in Your Browser

1. Open your browser and go to: **http://localhost:5173**
2. You should see the login screen

---

## Step 4: Test the App (Two Users)

### User 1:
1. Click **"Don't have an account? Register"**
2. Enter:
   - Username: `alice`
   - Password: `password123`
3. Click **"Register"**
4. You'll be logged in automatically

### User 2:
1. Open a **new browser window** (or incognito/private window)
2. Go to: **http://localhost:5173**
3. Click **"Don't have an account? Register"**
4. Enter:
   - Username: `bob`
   - Password: `password123`
5. Click **"Register"**

### Start Chatting:
1. In **Alice's window**: Click **"+ New Chat"**
2. Enter username: `bob`
3. Click **"Start Chat"**
4. Type a message and press Enter
5. Switch to **Bob's window** - you should see the message appear!

---

## 🎯 Quick Commands Summary

### Terminal 1 (Backend):
```bash
cd "D:\smthing stupid\GP\server"
npm install
npm start
```

### Terminal 2 (Frontend):
```bash
cd "D:\smthing stupid\GP\web"
npm install
npm run dev
```

---

## 🔧 Troubleshooting

### ❌ "npm is not recognized"
- Make sure Node.js is installed
- Try using the full path: `C:\Program Files\nodejs\npm.cmd install`

### ❌ "Port 3000 already in use"
- Another app is using port 3000
- Close that app or change the port in `server.js`:
  ```javascript
  const PORT = process.env.PORT || 3001; // Change to 3001
  ```

### ❌ "Cannot connect to server"
- Make sure the backend server is running (Terminal 1)
- Check that it says "Server running on http://localhost:3000"

### ❌ "WebSocket connection failed"
- Backend server must be running first
- Check browser console (F12) for errors
- Make sure both servers are running

### ❌ PowerShell Script Errors
- **Use Command Prompt instead** (cmd.exe)
- Or use Git Bash
- PowerShell has security restrictions that block npm scripts

---

## 📝 Notes

- **No MongoDB needed!** This version uses in-memory storage (data resets when server restarts)
- **No .env file needed** - uses default values
- **Messages are encrypted** - even the server can't read them
- **Data is temporary** - restarting the server clears all users/messages

---

## 🎉 Success Indicators

✅ Backend terminal shows: `Server running on http://localhost:3000`  
✅ Frontend terminal shows: `Local: http://localhost:5173/`  
✅ Browser shows login screen  
✅ You can register and login  
✅ You can send messages between users  

---

## 🚀 Next Steps

- Deploy backend to Heroku/Railway/Render
- Deploy frontend to GitHub Pages/Vercel/Netlify
- Add MongoDB for persistent storage
- Build mobile app with React Native


