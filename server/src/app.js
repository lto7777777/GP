const fs = require("fs");
const path = require("path");
const https = require("https");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

// Load SSL certificates
const privateKey = fs.readFileSync(path.join(__dirname, "..", "certs", "server.key"));
const certificate = fs.readFileSync(path.join(__dirname, "..", "certs", "server.crt"));

const httpsServer = https.createServer({ key: privateKey, cert: certificate }, app);

// WebSocket
const io = new Server(httpsServer, {
    cors: { origin: "*" }
});

// Socket events
io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    socket.on("send_message", (data) => {
        socket.broadcast.emit("receive_message", data);
    });
});

// Start HTTPS server
httpsServer.listen(3000, () => {
    console.log("Secure server running at https://localhost:3000");
});
