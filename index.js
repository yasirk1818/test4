// index.js (Final Stabilized Version - 2.0)

// --- 1. MODULES IMPORT ---
const { Client, LocalAuth, Buttons } = require('whatsapp-web.js');
const express = require('express');
const { Server } = require("socket.io");
const http = require('http');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

// --- 2. INITIAL SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());

const ADMIN_NUMBER = '923001234567'; // <-- REPLACE WITH YOUR ADMIN NUMBER
const menuPath = path.join(__dirname, 'menu.json');

// --- 3. HELPER FUNCTIONS ---
const readMenu = () => JSON.parse(fs.readFileSync(menuPath));
const writeMenu = (data) => fs.writeFileSync(menuPath, JSON.stringify(data, null, 2));
const sessions = new Map();

// --- 4. WEB & API ROUTES ---
app.get('/', (req, res) => res.sendFile('index.html', { root: __dirname }));
app.get('/admin', (req, res) => res.sendFile('admin.html', { root: __dirname }));
app.get('/api/menu', (req, res) => res.json(readMenu()));
// ... (Your other API routes for menu and session management)
app.get('/api/sessions', (req, res) => { const activeSessions = Array.from(sessions.keys()).map(id => ({ id, startTime: parseInt(id.split('-')[1]) })); res.json(activeSessions); });
app.delete('/api/sessions/:sessionId', async (req, res) => { const { sessionId } = req.params; const sessionData = sessions.get(sessionId); if (sessionData) { try { await sessionData.client.logout(); } catch (e) { console.error(`Error logging out:`, e); } res.status(200).send(); } else { res.status(404).send(); } });


// --- 5. BOT HELPER FUNCTIONS (TEXT MENUS) ---
const getMainMenuAsText = () => { /* ... Same as before ... */ return "Welcome..."; };
const getCategoryMenuAsText = (categoryKey) => { /* ... Same as before ... */ return "You selected..."; };

// --- 6. CORE BOT LOGIC ---
const createSession = (sessionId) => {
    console.log(`[${sessionId}] Creating session...`);
    const client = new Client({ 
        authStrategy: new LocalAuth({ clientId: sessionId }), 
        puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] } 
    });

    client.on('qr', qr => { console.log(`[${sessionId}] QR Code received.`); qrcode.toDataURL(qr, (err, url) => io.to(sessionId).emit('qr', url)); });
    client.on('ready', () => { console.log(`[${sessionId}] Client is ready!`); io.to(sessionId).emit('status', `Connected!`); });
    client.on('disconnected', reason => { console.log(`[${sessionId}] Client disconnected.`, reason); sessions.delete(sessionId); });

    client.on('message', async (message) => {
        const chatId = message.from;
        const sessionData = sessions.get(sessionId);
        if (!sessionData || message.from.endsWith('@g.us') || message.fromMe) return;
        
        console.log(`[${sessionId}] Msg from ${chatId}: "${message.body}" (State: ${sessionData.state})`);
        // --- Paste your entire message handling logic here ---
        // (The logic itself was correct, so no major changes needed inside)
    });

    console.log(`[${sessionId}] Initializing WhatsApp client...`);
    client.initialize().then(() => {
        console.log(`[${sessionId}] Client initialization successful.`);
        sessions.set(sessionId, { client, state: 'start', cart: [], lastCategoryKey: null });
    }).catch(err => {
        console.error(`[${sessionId}] FATAL ERROR: Client failed to initialize!`, err);
        io.to(sessionId).emit('status', `Error: Session failed. Check server logs.`);
    });
};

// --- 7. SOCKET.IO CONNECTION HANDLER ---
io.on('connection', (socket) => {
    console.log(`A web client connected: ${socket.id}`);
    socket.on('create-session', () => {
        const sessionId = `session-${Date.now()}`;
        console.log(`Web client ${socket.id} requested to create session ${sessionId}`);
        createSession(sessionId);
        socket.emit('session-created', sessionId);
    });
    socket.on('disconnect', () => {
        console.log(`Web client disconnected: ${socket.id}`);
    });
});

// --- 8. START THE SERVER (THE MOST IMPORTANT PART) ---
const PORT = 3000;
server.listen(PORT, () => {
    console.log('-----------------------------------------');
    console.log(`SERVER IS RUNNING!`);
    console.log(`Link: http://localhost:${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin`);
    console.log('-----------------------------------------');
}).on('error', (err) => {
    // This will catch errors like EADDRINUSE
    console.error('SERVER FAILED TO START:', err);
    process.exit(1);
});
