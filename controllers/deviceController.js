const Device = require('../models/Device');
const { createWhatsAppClient } = require('../utils/whatsappClient');

exports.addDevice = async (req, res) => {
    const { name } = req.body;
    const sessionId = `session_${Date.now()}_${req.user.id}`;
    const device = new Device({
        userId: req.user.id,
        sessionId,
        settings: {}
    });
    await device.save();
    res.redirect('/dashboard');
};

exports.listDevices = async (req, res) => {
    const devices = await Device.find({ userId: req.user.id });
    res.json(devices);
};

exports.connectDevice = async (req, res) => {
    const { id } = req.params;
    const device = await Device.findById(id);
    if (!device || device.userId.toString() !== req.user.id) return res.sendStatus(403);

    createWhatsAppClient(device.sessionId, req.user.id);
    res.json({ sessionId: device.sessionId });
};

exports.disconnectDevice = async (req, res) => {
    const { id } = req.params;
    const device = await Device.findById(id);
    if (!device || device.userId.toString() !== req.user.id) return res.sendStatus(403);

    const { removeClient } = require('../utils/whatsappClient');
    removeClient(device.sessionId);
    device.status = 'disconnected';
    await device.save();
    res.sendStatus(200);
};

exports.deleteDevice = async (req, res) => {
    const { id } = req.params;
    const device = await Device.findById(id);
    if (!device || device.userId.toString() !== req.user.id) return res.sendStatus(403);

    const { removeClient } = require('../utils/whatsappClient');
    removeClient(device.sessionId);
    await Device.findByIdAndDelete(id);
    res.sendStatus(200);
};

exports.updateSettings = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    await Device.findByIdAndUpdate(id, { settings: updates });
    res.sendStatus(200);
};
