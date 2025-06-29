const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static(path.join(__dirname, "../frontend")));

// ✅ File Upload Settings (Modify as Needed)
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB limit
const ALLOWED_FILE_TYPES = ["jpg", "jpeg", "png", "pdf", "txt", "mp4"]; // ✅ Added "jpeg"
const DELETE_OLD_FILES = true; // ✅ Set to false to keep all files
const ENCRYPT_FILE_NAMES = true; // ✅ Set to false for original file names

// ✅ Ensure 'uploads' directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// ✅ Serve uploaded files
app.use("/uploads", express.static(UPLOADS_DIR));

const users = {};

io.on("connection", (socket) => {
    console.log(`🔗 User connected: ${socket.id}`);

    socket.on("set username", (username) => {
        users[socket.id] = username;
        io.emit("user update", Object.values(users));
    });

    socket.on("chat message", (data) => {
        if (!users[socket.id]) return;
        io.emit("chat message", {
            username: users[socket.id],
            message: data.message,
            timestamp: new Date().toLocaleTimeString()
        });
    });

    // ✅ Save File to Server with Optional Features
    socket.on("file upload", ({ recipientId, fileName, fileData }) => {
        try {
            console.log(`📂 Receiving file: ${fileName} from ${users[socket.id]}`);

            const fileBuffer = Buffer.from(fileData, "base64");
            if (fileBuffer.length > MAX_FILE_SIZE) {
                socket.emit("error message", "❌ File too large (Max: 20MB)");
                return;
            }

            // ✅ File Type Validation (Optional)
            const fileExtension = fileName.split(".").pop().toLowerCase();
            if (ALLOWED_FILE_TYPES.length > 0 && !ALLOWED_FILE_TYPES.includes(fileExtension)) {
                socket.emit("error message", "❌ File type not allowed");
                return;
            }

            // ✅ Encrypt File Name (Optional)
            const safeFileName = ENCRYPT_FILE_NAMES
                ? crypto.randomBytes(10).toString("hex") + "." + fileExtension
                : fileName.replace(/\s/g, "_");

            const filePath = path.join(UPLOADS_DIR, safeFileName);
            fs.writeFileSync(filePath, fileBuffer);
            console.log(`✅ File saved: ${filePath}`);

            const fileUrl = `/uploads/${safeFileName}`;
            if (recipientId) {
                socket.to(recipientId).emit("file upload", { sender: users[socket.id], fileName, fileUrl });
            } else {
                io.emit("file upload", { sender: users[socket.id], fileName, fileUrl });
            }

            // ✅ Delete Old Files (Optional)
            if (DELETE_OLD_FILES) {
                setTimeout(() => {
                    try {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            console.log(`🗑 File deleted: ${filePath}`);
                        }
                    } catch (err) {
                        console.error("❌ File deletion error:", err);
                    }
                }, 10 * 60 * 1000); // Delete after 10 minutes (adjust as needed)
            }
        } catch (err) {
            console.error("❌ File upload error:", err);
            socket.emit("error message", "❌ File upload failed.");
        }
    });

    socket.on("disconnect", () => {
        if (users[socket.id]) {
            console.log(`❌ User disconnected: ${users[socket.id]} (${socket.id})`);
            socket.broadcast.emit("chat message", {
                username: "System",
                message: `${users[socket.id]} left the chat!`,
                system: true
            });
            delete users[socket.id];
            io.emit("user update", Object.values(users));
        }
    });
});

// ✅ Start Server
const PORT = 3000;
const HOST = "0.0.0.0"; 
server.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
