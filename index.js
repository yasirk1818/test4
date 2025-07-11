// index.js (Final Corrected Version)

const { Client, LocalAuth, Buttons, List } = require('whatsapp-web.js');
const express = require('express');
const { Server } = require("socket.io");
const http = require('http');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());

const ADMIN_NUMBER = '923001234567'; // <-- YAHAN APNA NUMBER LIKHAIN
const menuPath = path.join(__dirname, 'menu.json');

// Helper Functions
const readMenu = () => JSON.parse(fs.readFileSync(menuPath));
const writeMenu = (data) => fs.writeFileSync(menuPath, JSON.stringify(data, null, 2));

const sessions = new Map();

// --- API & WEB ROUTES --- (Same as before)
app.get('/', (req, res) => res.sendFile('index.html', { root: __dirname }));
app.get('/admin', (req, res) => res.sendFile('admin.html', { root: __dirname }));
app.get('/api/menu', (req, res) => res.json(readMenu()));
// ... (Your other API routes for menu and session management go here. They don't need changes)
app.get('/api/sessions', (req, res) => { const activeSessions = Array.from(sessions.keys()).map(id => ({ id, startTime: parseInt(id.split('-')[1]) })); res.json(activeSessions); });
app.delete('/api/sessions/:sessionId', async (req, res) => { const { sessionId } = req.params; const sessionData = sessions.get(sessionId); if (sessionData) { try { await sessionData.client.logout(); } catch (e) { console.error(`Error logging out:`, e); } res.status(200).send(); } else { res.status(404).send(); } });


// --- BOT LOGIC (WITH THE DEFINITIVE FIX) ---
const createSession = (sessionId) => {
    console.log(`[${sessionId}] Creating session...`);
    const client = new Client({ 
        authStrategy: new LocalAuth({ clientId: sessionId }), 
        puppeteer: { 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] 
        } 
    });

    client.on('qr', qr => {
        console.log(`[${sessionId}] QR Code received.`);
        qrcode.toDataURL(qr, (err, url) => io.to(sessionId).emit('qr', url));
    });

    client.on('ready', () => { 
        console.log(`[${sessionId}] Client is ready!`);
        io.to(sessionId).emit('status', `Connected! Send 'menu' to start.`);
        io.to(sessionId).emit('qr', null);
    });
    
    client.on('disconnected', (reason) => {
        console.log(`[${sessionId}] Client was disconnected. Reason:`, reason);
        sessions.delete(sessionId);
    });

    // --- THE FIX IS HERE: The message handler is now correctly defined within the client's scope ---
    client.on('message', async (message) => {
        const chatId = message.from;
        const sessionData = sessions.get(sessionId); // This now correctly uses 'sessionId' from the outer function scope

        if (!sessionData || message.from.endsWith('@g.us') || message.fromMe) return;
        
        console.log(`[${sessionId}] Received message from ${chatId}: "${message.body}"`);

        const lowerCaseText = message.body.toLowerCase();
        
        // --- Message Handling Logic ---
        // (This is your existing correct logic, it should work fine now)
        if (message.type === 'chat') {
            if (lowerCaseText.includes('menu') || lowerCaseText.includes('hi')) {
                sessionData.state = 'main_menu'; sessionData.cart = [];
                await client.sendMessage(chatId, getMainMenu()); return;
            }
            if (sessionData.state === 'awaiting_address') {
                const address = message.body;
                await client.sendMessage(chatId, `Thank you! Your order is placed.\nAddress: *${address}*`);
                let orderSummary = `*🚨 New Order! 🚨*\n\n*Customer:* ${chatId.replace('@c.us', '')}\n*Address:* ${address}\n\n*Items:*\n`, total = 0;
                sessionData.cart.forEach(item => { orderSummary += ` - ${item.name} (Rs. ${item.price})\n`; total += item.price; });
                orderSummary += `\n*Total: Rs. ${total}*`;
                client.sendMessage(`${ADMIN_NUMBER}@c.us`, orderSummary).catch(e => console.error('Failed to send admin notification:', e));
                io.emit('new-order', { customer: chatId.replace('@c.us', ''), address, cart: sessionData.cart, total, time: new Date().toLocaleTimeString() });
                sessionData.state = 'start'; sessionData.cart = []; return;
            }
            const menu = readMenu(); const flatMenuList = [];
            for (const categoryKey in menu) { menu[categoryKey].items.forEach(item => flatMenuList.push({ ...item, categoryKey })); }
            const fuse = new Fuse(flatMenuList, { keys: ['name'], threshold: 0.4 });
            const results = fuse.search(lowerCaseText).map(r => r.item);
            if (results.length === 1) { sessionData.cart.push(results[0]); sessionData.state = 'item_added'; await client.sendMessage(chatId, new Buttons(`Added ${results[0].name}.`, [{ body: 'Add More' }, { body: 'Checkout' }], 'What next?')); } 
            else if (results.length > 1) { sessionData.state = 'selecting_from_keyword'; const rows = results.map(i => ({ id: `item_${i.categoryKey}_${i.id}`, title: i.name, description: `Rs. ${i.price}` })); await client.sendMessage(chatId, new List(`We have a few options for "${message.body}".`, 'Select Item', [{ title: 'Matching Items', rows }])); } 
            else { await client.sendMessage(chatId, "Sorry, I didn't understand. Type 'menu' to see options."); }
        } else if (message.selectedRowId || message.body) {
            // Your switch-case logic for button/list replies goes here...
            // ... (Same as before)
        }
    });

    client.initialize().catch(err => console.error(`[${sessionId}] Failed to initialize client:`, err));
    
    sessions.set(sessionId, { 
        client: client, 
        state: 'start', 
        cart: [] 
    });
};

const getMainMenu = () => new List('Please choose a category.', 'View Menu', [{ title: 'Main Categories', rows: Object.keys(readMenu()).map(key => ({ id: `cat_${key}`, title: readMenu()[key].title })) }], 'Hotel Bot Menu');


// --- Server Start ---
io.on('connection', (socket) => {
    socket.on('create-session', () => { const sessionId = `session-${Date.now()}`; createSession(sessionId); socket.emit('session-created', sessionId); });
    socket.on('join-session', (sessionId) => { socket.join(sessionId); });
});
const PORT = 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}. Admin: http://localhost:${PORT}/admin`));
