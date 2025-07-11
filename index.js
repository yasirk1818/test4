// index.js (Final Corrected Version with Enhanced Error Handling)

const { Client, LocalAuth, Buttons } = require('whatsapp-web.js'); // List is removed
const express = require('express');
const { Server } = require("socket.io");
const http = require('http');
const qrcode = require('qrcode');
const fs =require('fs');
const path = require('path');
const Fuse = require('fuse.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());

const ADMIN_NUMBER = '923001234567'; // <-- REPLACE WITH YOUR ADMIN/KITCHEN NUMBER
const menuPath = path.join(__dirname, 'menu.json');

// --- Helper Functions ---
const readMenu = () => JSON.parse(fs.readFileSync(menuPath));
const writeMenu = (data) => fs.writeFileSync(menuPath, JSON.stringify(data, null, 2));
const sessions = new Map();

// --- API & WEB ROUTES --- (No Changes Here)
app.get('/', (req, res) => res.sendFile('index.html', { root: __dirname }));
app.get('/admin', (req, res) => res.sendFile('admin.html', { root: __dirname }));
app.get('/api/menu', (req, res) => res.json(readMenu()));
app.get('/api/sessions', (req, res) => { const activeSessions = Array.from(sessions.keys()).map(id => ({ id, startTime: parseInt(id.split('-')[1]) })); res.json(activeSessions); });
app.delete('/api/sessions/:sessionId', async (req, res) => { const { sessionId } = req.params; const sessionData = sessions.get(sessionId); if (sessionData) { try { await sessionData.client.logout(); } catch (e) { console.error(`Error logging out:`, e); } res.status(200).send(); } else { res.status(404).send(); } });


// --- BOT HELPER FUNCTIONS (Plain Text Menus) ---
const getMainMenuAsText = () => {
    const menu = readMenu();
    let menuText = "Welcome to our Hotel Bot! 🏨\n\nPlease reply with the number of the category:\n\n";
    Object.keys(menu).forEach((key, index) => { menuText += `*${index + 1}.* ${menu[key].title}\n`; });
    menuText += "\nOr type the name of an item you want (e.g., 'biryani').";
    return menuText;
};
const getCategoryMenuAsText = (categoryKey) => {
    const menu = readMenu();
    const category = menu[categoryKey];
    if (!category) return "Sorry, invalid category.";
    let categoryText = `You selected *${category.title}*.\nReply with the item number:\n\n`;
    category.items.forEach((item, index) => { categoryText += `*${index + 1}.* ${item.name} - Rs. ${item.price}\n`; });
    categoryText += "\nReply with '0' to go back.";
    return categoryText;
};


const createSession = (sessionId) => {
    console.log(`[${sessionId}] Creating new session...`);
    const client = new Client({ 
        authStrategy: new LocalAuth({ clientId: sessionId }), 
        puppeteer: { 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] 
        } 
    });

    client.on('qr', qr => {
        console.log(`[${sessionId}] QR Code received. Sending to frontend.`);
        qrcode.toDataURL(qr, (err, url) => io.to(sessionId).emit('qr', url));
    });

    client.on('ready', () => { 
        console.log(`[${sessionId}] Client is ready and connected!`);
        io.to(sessionId).emit('status', `Connected! Bot is active.`);
        io.to(sessionId).emit('qr', null); // Hide QR code
    });
    
    client.on('disconnected', reason => {
        console.log(`[${sessionId}] Client was disconnected. Reason:`, reason);
        sessions.delete(sessionId);
    });

    client.on('message', async (message) => {
        const chatId = message.from;
        const sessionData = sessions.get(sessionId);
        if (!sessionData || message.from.endsWith('@g.us') || message.fromMe) return;
        
        console.log(`[${sessionId}] Msg from ${chatId}: "${message.body}" (State: ${sessionData.state})`);
        // ... (Your entire message handling logic goes here. It should be correct from the previous version)
        // For absolute clarity, pasting the logic again.
        const lowerCaseText = message.body.toLowerCase();
        const userChoice = parseInt(message.body, 10);

        if (!isNaN(userChoice)) {
            if (sessionData.state === 'main_menu') { const menu = readMenu(); const categoryKeys = Object.keys(menu); if (userChoice > 0 && userChoice <= categoryKeys.length) { const selectedCategoryKey = categoryKeys[userChoice - 1]; sessionData.lastCategoryKey = selectedCategoryKey; sessionData.state = 'selecting_item'; await client.sendMessage(chatId, getCategoryMenuAsText(selectedCategoryKey)); } else { await client.sendMessage(chatId, "Invalid number."); } return; }
            if (sessionData.state === 'selecting_item') { if (userChoice === 0) { sessionData.state = 'main_menu'; await client.sendMessage(chatId, getMainMenuAsText()); return; } const menu = readMenu(); const items = menu[sessionData.lastCategoryKey]?.items; if (items && userChoice > 0 && userChoice <= items.length) { const selectedItem = items[userChoice - 1]; sessionData.cart.push(selectedItem); sessionData.state = 'item_added'; await client.sendMessage(chatId, new Buttons(`Added *${selectedItem.name}*.`, [{ body: 'Add More' }, { body: 'Checkout' }])); } else { await client.sendMessage(chatId, "Invalid number."); } return; }
        }
        if (lowerCaseText.includes('menu') || lowerCaseText.includes('hi')) { sessionData.state = 'main_menu'; sessionData.cart = []; await client.sendMessage(chatId, getMainMenuAsText()); return; }
        if (sessionData.state === 'item_added') { if (lowerCaseText === 'add more') { sessionData.state = 'main_menu'; await client.sendMessage(chatId, getMainMenuAsText()); return; } if (lowerCaseText === 'checkout') { sessionData.state = 'confirming_order'; let summary = 'Your Order:\n', total = 0; sessionData.cart.forEach(i => { summary += `\n- ${i.name} (Rs. ${i.price})`; total += i.price; }); summary += `\n\n*Total: Rs. ${total}*`; await client.sendMessage(chatId, new Buttons(summary, [{ body: 'Confirm Order' }, { body: 'Cancel' }])); return; } }
        if (sessionData.state === 'confirming_order') { if (lowerCaseText === 'confirm order') { sessionData.state = 'awaiting_address'; await client.sendMessage(chatId, 'Please type your delivery address.'); } else { sessionData.state = 'start'; sessionData.cart = []; await client.sendMessage(chatId, 'Order cancelled.'); } return; }
        if (sessionData.state === 'awaiting_address') { const address = message.body; await client.sendMessage(chatId, `Thank you! Your order is placed.\nAddress: *${address}*`); return; }

        // Fuzzy search as a fallback
        // ... (This logic remains the same)
    });

    // --- UPDATED INITIALIZATION WITH ERROR HANDLING ---
    console.log(`[${sessionId}] Initializing client... This might take a moment.`);
    client.initialize().then(() => {
        console.log(`[${sessionId}] Client initialization process finished.`);
        // Add to sessions map ONLY on successful initialization
        sessions.set(sessionId, { 
            client: client, 
            state: 'start', 
            cart: [], 
            lastCategoryKey: null 
        });
    }).catch(err => {
        // This is the most important part
        console.error(`[${sessionId}] FATAL ERROR: Client failed to initialize!`, err);
        io.to(sessionId).emit('status', `Error: Failed to start session. Check server logs for details.`);
        sessions.delete(sessionId);
    });
};


// --- Server Start ---
io.on('connection', (socket) => {
    socket.on('create-session', () => { const sessionId = `session-${Date.now()}`; createSession(sessionId); socket.emit('session-created', sessionId); });
});
const PORT = 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}. Admin: http://localhost:${PORT}/admin`));
