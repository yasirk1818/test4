// index.js (Final Corrected Version with Plain Text Menus)

const { Client, LocalAuth, Buttons } = require('whatsapp-web.js'); // List ko yahan se hata diya hai
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

// --- API & WEB ROUTES --- (No Changes Here)
app.get('/', (req, res) => res.sendFile('index.html', { root: __dirname }));
app.get('/admin', (req, res) => res.sendFile('admin.html', { root: __dirname }));
// ... (All your other API routes for menu and session management)
app.get('/api/menu', (req, res) => res.json(readMenu()));
app.get('/api/sessions', (req, res) => { const activeSessions = Array.from(sessions.keys()).map(id => ({ id, startTime: parseInt(id.split('-')[1]) })); res.json(activeSessions); });
app.delete('/api/sessions/:sessionId', async (req, res) => { const { sessionId } = req.params; const sessionData = sessions.get(sessionId); if (sessionData) { try { await sessionData.client.logout(); } catch (e) { console.error(`Error logging out:`, e); } res.status(200).send(); } else { res.status(404).send(); } });


// --- NEW: BOT HELPER FUNCTIONS (REPLACING LISTS WITH TEXT) ---
const getMainMenuAsText = () => {
    const menu = readMenu();
    let menuText = "Welcome to our Hotel Bot! 🏨\n\nPlease reply with the number of the category you'd like to see:\n\n";
    Object.keys(menu).forEach((key, index) => {
        menuText += `*${index + 1}.* ${menu[key].title}\n`;
    });
    menuText += "\nYou can also type the name of an item you're looking for (e.g., 'biryani').";
    return menuText;
};

const getCategoryMenuAsText = (categoryKey) => {
    const menu = readMenu();
    const category = menu[categoryKey];
    if (!category) return "Sorry, that category doesn't exist.";

    let categoryText = `You selected *${category.title}*.\nPlease reply with the number of the item you want to add:\n\n`;
    category.items.forEach((item, index) => {
        categoryText += `*${index + 1}.* ${item.name} - Rs. ${item.price}\n`;
    });
    categoryText += "\nReply with '0' to go back to the main menu.";
    return categoryText;
};


const createSession = (sessionId) => {
    console.log(`[${sessionId}] Creating session...`);
    const client = new Client({ authStrategy: new LocalAuth({ clientId: sessionId }), puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] } });

    client.on('qr', qr => qrcode.toDataURL(qr, (err, url) => io.to(sessionId).emit('qr', url)));
    client.on('ready', () => { console.log(`[${sessionId}] Client is ready!`); io.to(sessionId).emit('status', `Connected!`); });
    client.on('disconnected', reason => { console.log(`[${sessionId}] Client disconnected.`, reason); sessions.delete(sessionId); });

    client.on('message', async (message) => {
        const chatId = message.from;
        const sessionData = sessions.get(sessionId);
        if (!sessionData || message.from.endsWith('@g.us') || message.fromMe) return;
        
        console.log(`[${sessionId}] Msg from ${chatId}: "${message.body}" (State: ${sessionData.state})`);

        const lowerCaseText = message.body.toLowerCase();
        const userChoice = parseInt(message.body, 10);

        // --- NEW, SIMPLIFIED MESSAGE HANDLING LOGIC ---

        // Handling numbered replies
        if (!isNaN(userChoice)) {
            if (sessionData.state === 'main_menu') {
                const menu = readMenu();
                const categoryKeys = Object.keys(menu);
                if (userChoice > 0 && userChoice <= categoryKeys.length) {
                    const selectedCategoryKey = categoryKeys[userChoice - 1];
                    sessionData.lastCategoryKey = selectedCategoryKey; // Remember which category we are in
                    sessionData.state = 'selecting_item';
                    await client.sendMessage(chatId, getCategoryMenuAsText(selectedCategoryKey));
                } else {
                    await client.sendMessage(chatId, "Invalid number. Please select a valid category number from the menu.");
                }
                return;
            }

            if (sessionData.state === 'selecting_item') {
                if (userChoice === 0) { // Go back to main menu
                    sessionData.state = 'main_menu';
                    await client.sendMessage(chatId, getMainMenuAsText());
                    return;
                }

                const menu = readMenu();
                const items = menu[sessionData.lastCategoryKey]?.items;
                if (items && userChoice > 0 && userChoice <= items.length) {
                    const selectedItem = items[userChoice - 1];
                    sessionData.cart.push(selectedItem);
                    sessionData.state = 'item_added';
                    // Use Buttons here, as they are still supported
                    await client.sendMessage(chatId, new Buttons(`Added *${selectedItem.name}* to your cart.`, [{ body: 'Add More' }, { body: 'Checkout' }], 'What would you like to do next?'));
                } else {
                    await client.sendMessage(chatId, "Invalid number. Please select a valid item number or 0 to go back.");
                }
                return;
            }
        }
        
        // Handling keyword-based text messages (Hi, menu, checkout, etc.)
        if (lowerCaseText.includes('menu') || lowerCaseText.includes('hi')) {
            sessionData.state = 'main_menu';
            sessionData.cart = [];
            await client.sendMessage(chatId, getMainMenuAsText());
            return;
        }

        // Handle button replies or text commands
        if (sessionData.state === 'item_added') {
            if (lowerCaseText === 'add more') {
                sessionData.state = 'main_menu';
                await client.sendMessage(chatId, getMainMenuAsText());
                return;
            }
            if (lowerCaseText === 'checkout') {
                sessionData.state = 'confirming_order';
                let summary = 'Your Order:\n', total = 0;
                sessionData.cart.forEach(i => { summary += `\n- ${i.name} (Rs. ${i.price})`; total += i.price; });
                summary += `\n\n*Total: Rs. ${total}*`;
                await client.sendMessage(chatId, new Buttons(summary, [{ body: 'Confirm Order' }, { body: 'Cancel' }], 'Please confirm your order.'));
                return;
            }
        }
        
        if (sessionData.state === 'confirming_order') {
            if (lowerCaseText === 'confirm order') { sessionData.state = 'awaiting_address'; await client.sendMessage(chatId, 'Great! Please type your full delivery address.'); } 
            else { sessionData.state = 'start'; sessionData.cart = []; await client.sendMessage(chatId, 'Order cancelled. Type "menu" to start again.'); }
            return;
        }
        
        if (sessionData.state === 'awaiting_address') {
            const address = message.body;
            await client.sendMessage(chatId, `Thank you! Your order is placed.\nAddress: *${address}*`);
            // Your notification logic here...
            return;
        }

        // Fuzzy search as a fallback if no other state matches
        const menu = readMenu(); const flatMenuList = [];
        for (const categoryKey in menu) { menu[categoryKey].items.forEach(item => flatMenuList.push({ ...item, categoryKey })); }
        const fuse = new Fuse(flatMenuList, { keys: ['name'], threshold: 0.4 });
        const results = fuse.search(lowerCaseText).map(r => r.item);

        if (results.length === 1) { 
            sessionData.cart.push(results[0]);
            sessionData.state = 'item_added';
            await client.sendMessage(chatId, new Buttons(`Added *${results[0].name}*.`, [{ body: 'Add More' }, { body: 'Checkout' }], 'What next?'));
        } else if (results.length > 1) {
            await client.sendMessage(chatId, `Found multiple items for "${message.body}". Please be more specific (e.g., 'Chicken Karahi').`);
        } else {
            await client.sendMessage(chatId, "Sorry, I didn't understand. Type 'menu' to see options.");
        }
    });

    client.initialize().catch(err => console.error(`[${sessionId}] Failed to initialize:`, err));
    
    sessions.set(sessionId, { client, state: 'start', cart: [], lastCategoryKey: null });
};

// --- Server Start ---
io.on('connection', (socket) => {
    socket.on('create-session', () => { const sessionId = `session-${Date.now()}`; createSession(sessionId); socket.emit('session-created', sessionId); });
});
const PORT = 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}. Admin: http://localhost:${PORT}/admin`));
