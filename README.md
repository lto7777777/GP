# SecureChat - End-to-End Encrypted Messaging App

A Telegram-like encrypted chat application with:
- ✅ Username/password authentication
- ✅ End-to-end encryption (RSA-OAEP + AES-GCM)
- ✅ Multi-device support (automatic)
- ✅ Real-time messaging via WebSocket
- ✅ Clean, modern UI

## 🚀 Quick Start

### 1. Install Backend Dependencies

```bash
cd server
npm install
```

This will install:
- `express` - Web server
- `ws` - WebSocket server
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication
- `cors`, `helmet`, `body-parser` - Security & middleware

### 2. Start the Backend Server

```bash
cd server
npm start
# or for development with auto-reload:
npm run dev
```

Server will run on `http://localhost:3000`

### 3. Install Frontend Dependencies

```bash
cd web
npm install
```

### 4. Start the Web App

```bash
cd web
npm run dev
```

Open `http://localhost:5173` in your browser.

## 📱 How to Use

### First Time Setup

1. **Register an account:**
   - Open the web app
   - Click "Don't have an account? Register"
   - Enter a username and password
   - Click "Register"

2. **Login:**
   - Enter your username and password
   - Click "Login"
   - Your device will automatically generate encryption keys (invisible to you)

### Chatting with Friends

1. **Start a new chat:**
   - Click "+ New Chat" button
   - Enter your friend's username
   - Click "Start Chat"

2. **Send messages:**
   - Type your message
   - Press Enter or click "Send"
   - Messages are automatically encrypted before sending
   - Only your friend can decrypt them (even the server can't read them!)

3. **View conversations:**
   - All your chats appear in the chat list
   - Click any chat to open it
   - Messages sync across all your devices automatically

## 🔒 Security Features

- **End-to-End Encryption:** Messages are encrypted on your device and can only be decrypted by the recipient
- **Server Cannot Read Messages:** The server only sees encrypted blobs
- **Multi-Device Support:** Each device has its own encryption keys
- **Automatic Key Management:** Keys are generated and managed automatically (you never see them)

## 🏗️ Architecture

### Backend (`server/`)
- REST API for authentication, device registration, and message history
- WebSocket server for real-time message delivery
- In-memory storage (replace with MongoDB/PostgreSQL for production)

### Frontend (`web/`)
- React app with clean Telegram-like UI
- Web Crypto API for encryption/decryption
- Automatic device registration and key management

## 🔧 Configuration

### Environment Variables

**Backend:**
- `PORT` - Server port (default: 3000)
- `JWT_SECRET` - Secret for JWT tokens (change in production!)

**Frontend:**
- `VITE_API_BASE` - Backend API URL (default: http://localhost:3000)

## 📝 Next Steps for Production

1. **Database:** Replace in-memory storage with MongoDB/PostgreSQL
2. **HTTPS:** Deploy with proper SSL certificates
3. **Key Storage:** Encrypt private keys with user passphrase
4. **Mobile App:** Build React Native client
5. **Push Notifications:** Add FCM/APNs for mobile
6. **File Attachments:** Add encrypted file sharing

## 🐛 Troubleshooting

**"WebSocket error" or "Connecting..."**
- Make sure the backend server is running
- Check that port 3000 is not blocked

**"User not found"**
- Make sure your friend has registered and logged in at least once
- Check the username spelling

**Messages not appearing**
- Check browser console for errors
- Make sure both users are logged in
- Verify WebSocket connection is established (green "Online" indicator)

## 📄 License

ISC

