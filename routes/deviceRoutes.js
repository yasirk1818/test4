const express = require('express');
const router = express.Router();
const { addDevice, listDevices, connectDevice, disconnectDevice, deleteDevice, updateSettings } = require('../controllers/deviceController');
const auth = require('../middleware/auth');

router.post('/add', auth, addDevice);
router.get('/list', auth, listDevices);
router.post('/connect/:id', auth, connectDevice);
router.post('/disconnect/:id', auth, disconnectDevice);
router.delete('/delete/:id', auth, deleteDevice);
router.post('/settings/:id', auth, updateSettings);

module.exports = router;
