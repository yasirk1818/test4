require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');
const auth = require('./middleware/auth');

// App Setup
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('io', io);

// Routes
app.use('/auth', require('./routes/authRoutes'));
app.use('/devices', require('./routes/deviceRoutes'));

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));
app.get('/dashboard', auth, (req, res) => res.render('dashboard'));

// Socket.IO Room Join
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
    });
});

// DB & Server
mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log("MongoDB Connected");
    server.listen(process.env.PORT, () => {
        console.log(`Server running on http://localhost:${process.env.PORT}`);
    });
});
