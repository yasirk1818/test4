const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/logout', auth, (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});

module.exports = router;
