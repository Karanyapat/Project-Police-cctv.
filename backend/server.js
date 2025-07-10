// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { app: expressApp, setupSocketIO, setIO } = require('./app'); // Express + socket

const server = express();
const httpServer = http.createServer(server);

const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

setIO(io);          // ส่ง io ไปให้ app.js ใช้
setupSocketIO(io);  // กำหนด event websocket

// ให้ Express จัดการ API
server.use("/api", expressApp);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`🚀 API server with socket.io ready at http://localhost:${PORT}`);
});

