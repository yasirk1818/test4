const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const io = require('../server').io; // socket.io instance
const Device = require('../models/Device');

let clients = {}; // Store active WhatsApp clients

function createWhatsAppClient(sessionId, userId) {
    const sessionPath = `${process.env.SESSION_PATH}${sessionId}`;
    
    const client = new Client({
        session: null,
        puppeteer: { headless: true, args: ['--no-sandbox'] }
    });

    clients[sessionId] = client;

    client.on('qr', async (qr) => {
        const qrCode = await qrcode.toDataURL(qr);
        io.to(sessionId).emit('qr', qrCode);
        updateDeviceStatus(sessionId, 'qr-scanning');
    });

    client.on('ready', () => {
        console.log(`WhatsApp Client (${sessionId}) ready!`);
        io.to(sessionId).emit('ready');
        updateDeviceStatus(sessionId, 'connected');
    });

    client.on('disconnected', () => {
        console.log(`Client ${sessionId} disconnected`);
        updateDeviceStatus(sessionId, 'disconnected');
        delete clients[sessionId];
    });

    // Auto Read Messages
    client.on('message', msg => {
        Device.findOne({ sessionId }).then(device => {
            if (device?.settings.autoRead) {
                msg.markSeen();
            }
        });
    });

    client.initialize();
}

async function updateDeviceStatus(sessionId, status) {
    await Device.updateOne({ sessionId }, { status });
    io.to(sessionId).emit('status', status);
}

function getActiveClient(sessionId) {
    return clients[sessionId];
}

function removeClient(sessionId) {
    const client = clients[sessionId];
    if (client) {
        client.destroy();
        delete clients[sessionId];
    }
}

module.exports = { createWhatsAppClient, getActiveClient, removeClient };
