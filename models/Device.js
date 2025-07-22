const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sessionId: String,
    status: { type: String, default: 'disconnected' },
    keywords: [String],
    settings: {
        autoTyping: Boolean,
        autoRead: Boolean,
        alwaysOnline: Boolean,
        antiDelete: Boolean,
        viewOnce: Boolean,
        rejectCalls: Boolean,
        ghostMode: Boolean
    }
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);
