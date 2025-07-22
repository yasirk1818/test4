const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }]
});

module.exports = mongoose.model('User', userSchema);
