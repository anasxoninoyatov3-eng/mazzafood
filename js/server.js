// Load environment from .env if available
try { require('dotenv').config(); } catch (e) { }
// Start Telegram Bot
// require('../bot.js');

const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8429193461:AAEnBiGsVX4hKYVnKYCnI5ZdLvNg7_0jZdE";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || 8283401187;

app.use(express.json());

// CORS headers middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Serve static files from the parent directory
app.use(express.static(path.join(__dirname, '../')));

// In-memory OTP storage: { phone: { code, expiresAt, attempts } }
const otpStore = {};

// PlayMobile.uz SMS API helper
async function sendPlayMobileSms(phone, code) {
    const login = process.env.PLAYMOBILE_LOGIN;
    const password = process.env.PLAYMOBILE_PASSWORD;
    const originator = process.env.PLAYMOBILE_ORIGINATOR || '3700';
    const apiUrl = process.env.PLAYMOBILE_URL || 'https://send.smsxabar.uz/broker-api/send';

    if (!login || !password) {
        return { ok: false, error: 'PlayMobile credentials not set in environment variables' };
    }

    try {
        const cleanPhone = phone.replace(/[^\d]/g, ''); // 998XXXXXXXXX
        const msgId = 'mf_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

        const response = await axios.post(apiUrl, {
            messages: [
                {
                    recipient: cleanPhone,
                    'message-id': msgId,
                    sms: {
                        originator: originator,
                        content: {
                            text: `Mazza Food: Ro'yxatdan o'tish kodingiz: ${code}`
                        }
                    }
                }
            ]
        }, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        console.log('[PlayMobile SMS response]:', response.data);
        return { ok: true, provider: 'PlayMobile', data: response.data };
    } catch (err) {
        console.error('PlayMobile SMS Exception:', err?.response?.data || err.message);
        return { ok: false, provider: 'PlayMobile', error: err.message };
    }
}

// Eskiz.uz SMS integration helper (Fallback provider)
let eskizToken = null;
let eskizTokenExpires = 0;

async function sendEskizSms(phone, code) {
    const email = process.env.ESKIZ_EMAIL;
    const password = process.env.ESKIZ_PASSWORD;
    if (!email || !password) {
        return { ok: false, error: 'Eskiz credentials not set in environment variables' };
    }

    try {
        const cleanPhone = phone.replace(/[^\d]/g, ''); // 998XXXXXXXXX
        if (!eskizToken || Date.now() > eskizTokenExpires) {
            const authRes = await axios.post('https://api.eskiz.uz/api/auth/login', {
                email: email,
                password: password
            });
            if (authRes.data && authRes.data.data && authRes.data.data.token) {
                eskizToken = authRes.data.data.token;
                eskizTokenExpires = Date.now() + 25 * 24 * 60 * 60 * 1000;
            } else {
                throw new Error('Eskiz auth failed');
            }
        }

        const smsRes = await axios.post('https://api.eskiz.uz/api/message/sms/send', {
            mobile_phone: cleanPhone,
            message: `Mazza Food: Ro'yxatdan o'tish kodingiz: ${code}`,
            from: process.env.ESKIZ_FROM || '4546',
            callback_url: ''
        }, {
            headers: { Authorization: `Bearer ${eskizToken}` }
        });

        return { ok: true, provider: 'Eskiz', data: smsRes.data };
    } catch (err) {
        console.error('Eskiz SMS Exception:', err?.response?.data || err.message);
        return { ok: false, provider: 'Eskiz', error: err.message };
    }
}

// Endpoint to send SMS OTP
app.post('/api/send-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone || !/^\+998\d{9}$/.test(phone)) {
        return res.status(400).json({ ok: false, error: "Telefon raqami noto'g'ri (+998XXXXXXXXX)" });
    }

    // Rate limiting: 30 seconds between resends
    const existing = otpStore[phone];
    if (existing && existing.createdAt && (Date.now() - existing.createdAt) < 30000) {
        const remaining = Math.ceil((30000 - (Date.now() - existing.createdAt)) / 1000);
        return res.status(429).json({ ok: false, error: `Iltimos, qayta yuborish uchun ${remaining} soniya kuting.` });
    }

    // Generate random 4-digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    otpStore[phone] = {
        code: code,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes validity
        attempts: 0
    };

    console.log(`[SMS OTP generated for ${phone}]: ${code}`);

    // 1. First try sending via PlayMobile.uz SMS API
    let smsResult = await sendPlayMobileSms(phone, code);

    // 2. If PlayMobile fails or is not configured, fall back to Eskiz.uz
    if (!smsResult.ok) {
        const eskizResult = await sendEskizSms(phone, code);
        if (eskizResult.ok) {
            smsResult = eskizResult;
        }
    }

    // 3. Also send Telegram Notification to Admin/Bot for developer testing & redundancy
    try {
        const text = encodeURIComponent(`📲 <b>Mazza Food SMS Verifikatsiya</b>\n\nNomer: <code>${phone}</code>\nKod: <b>${code}</b>\nSMS Provayder: ${smsResult.ok ? smsResult.provider : 'Telegram Demo'}`);
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${text}&parse_mode=HTML`;
        https.get(url, () => { }).on('error', () => { });
    } catch (e) { }

    return res.json({
        ok: true,
        message: 'SMS kod yuborildi',
        smsSent: smsResult.ok,
        provider: smsResult.provider || 'Telegram Fallback'
    });
});

// Endpoint to verify SMS OTP
app.post('/api/verify-otp', (req, res) => {
    const { phone, code } = req.body;
    if (!phone || !code) {
        return res.status(400).json({ ok: false, error: "Barcha maydonlarni to'ldiring." });
    }

    const record = otpStore[phone];
    if (!record) {
        return res.status(400).json({ ok: false, error: "SMS kod topilmadi yoki muddati o'tgan. Qaytadan kod so'rang." });
    }

    if (Date.now() > record.expiresAt) {
        delete otpStore[phone];
        return res.status(400).json({ ok: false, error: "SMS kod muddati tugagan (5 min). Qaytadan kod so'rang." });
    }

    if (record.attempts >= 5) {
        delete otpStore[phone];
        return res.status(429).json({ ok: false, error: "Juda ko'p xato urinishlar qilindi. Yangi kod so'rang." });
    }

    if (record.code.trim() !== String(code).trim()) {
        record.attempts += 1;
        return res.status(400).json({ ok: false, error: "SMS kod noto'g'ri. Qayta urinib ko'ring." });
    }

    // Success! Clear OTP record
    delete otpStore[phone];
    return res.json({ ok: true, message: 'Nomer muvaffaqiyatli tasdiqlandi!' });
});

app.post('/api/send-order', (req, res) => {
    const order = req.body.order || req.body;

    if (!BOT_TOKEN || !CHAT_ID) {
        return res.status(500).json({ error: 'Server not configured with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID' });
    }

    const lines = [];
    lines.push(`📩 New order from ${order.name || 'Guest'}`);
    if (order.phone) lines.push(`📞 ${order.phone}`);
    if (order.address) lines.push(`📍 ${order.address}`);
    lines.push('');
    lines.push('Items:');

    if (order.items && typeof order.items === 'object') {
        Object.values(order.items).forEach(it => {
            lines.push(`• ${it.name} x${it.qty} — ${(it.price * it.qty).toLocaleString()} so'm`);
        });
    } else if (Array.isArray(order.items)) {
        order.items.forEach(it => {
            lines.push(`• ${it.name} x${it.qty} — ${(it.price * it.qty).toLocaleString()} so'm`);
        });
    }

    lines.push('');
    const total = (typeof order.total === 'number') ? order.total.toLocaleString() : order.total || '0';
    lines.push(`Jami: ${total} so'm`);

    if (order.delivery && order.delivery.method === 'zalda') {
        lines.push('');
        lines.push('buyurtma: ichkariga');
    }
    lines.push('');
    lines.push('@kmazzafoodbot dan');

    const text = encodeURIComponent(lines.join('\n'));
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${text}`;

    https.get(url, (tgRes) => {
        let data = '';
        tgRes.on('data', chunk => data += chunk);
        tgRes.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                if (parsed && parsed.ok) {
                    return res.json({ ok: true, telegram: parsed.result });
                }
                return res.status(502).json({ error: 'Telegram API error', details: parsed });
            } catch (err) {
                return res.status(502).json({ error: 'Invalid response from Telegram', raw: data });
            }
        });
    }).on('error', (err) => {
        console.error('Telegram request failed:', err);
        res.status(500).json({ error: 'Failed to reach Telegram API', details: String(err) });
    });
});

// -- REVIEW SYSTEM & BOT POLLING --
const adminBot = new TelegramBot(BOT_TOKEN, { polling: true });

let reviewsData = [];
let usersData = {};

function loadDb() {
    try {
        if (fs.existsSync('../reviews_db.json')) {
            reviewsData = JSON.parse(fs.readFileSync('../reviews_db.json', 'utf8'));
        }
        if (fs.existsSync('../users_db.json')) {
            usersData = JSON.parse(fs.readFileSync('../users_db.json', 'utf8'));
        }
    } catch (e) {
        console.error("DB Load Error:", e);
    }
}
function saveDb() {
    fs.writeFileSync('../reviews_db.json', JSON.stringify(reviewsData, null, 2));
    fs.writeFileSync('../users_db.json', JSON.stringify(usersData, null, 2));
}

loadDb();

app.post('/api/user-status', (req, res) => {
    const phone = req.body.phone;
    let warnings = 0;
    let blocked = false;
    let msg = '';

    if (phone && usersData[phone]) {
        warnings = usersData[phone].warnings || 0;
        blocked = warnings >= 3;
        msg = usersData[phone].lastWarning || '';
    }
    res.json({ warnings, blocked, msg, ok: true });
});

app.get('/api/reviews', (req, res) => {
    res.json({ ok: true, reviews: reviewsData.filter(r => r.status === 'approved') });
});

app.post('/api/reviews', (req, res) => {
    const review = req.body;
    let phone = review.phone || 'Noma\'lum';

    if (phone && usersData[phone]) {
        if ((usersData[phone].warnings || 0) >= 3) {
            return res.status(403).json({ error: 'Siz bloklangansiz' });
        }
    }

    review.id = Date.now().toString();
    review.status = 'pending';
    reviewsData.push(review);
    saveDb();

    let isCaps = review.text && review.text === review.text.toUpperCase() && /[A-Z]/.test(review.text);
    let capsWarning = isCaps ? "\n⚠️ DIQQAT: Habar CAPSda yozilgan!" : "";

    let text = `Yangi habar! ism: ${review.name || 'Noma\'lum'} nomer: ${phone} habar: ${review.text}${capsWarning}`;

    adminBot.sendMessage(CHAT_ID, text, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Qoldirish", callback_data: `apr_${review.id}` },
                    { text: "❌ O'chirish", callback_data: `rej_${review.id}` }
                ]
            ]
        }
    }).catch(e => console.error("Error sending review tg message:", e));

    res.json({ ok: true });
});

adminBot.on('callback_query', (query) => {
    const data = query.data;
    if (data.startsWith('apr_')) {
        const id = data.split('_')[1];
        let r = reviewsData.find(x => x.id === id);
        if (r) {
            r.status = 'approved';
            saveDb();
            adminBot.editMessageText(`Tasdiqlandi! Habar saytga yuklandi.\n\n${query.message.text}`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        }
    } else if (data.startsWith('rej_')) {
        const id = data.split('_')[1];
        adminBot.editMessageText(`nima sababdan o'chirmoqchisiz?\n\n${query.message.text}`, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "so'kinish", callback_data: `del_${id}_sokinish` }],
                    [{ text: "juda hunuk habar", callback_data: `del_${id}_hunuk` }]
                ]
            }
        });
    } else if (data.startsWith('del_')) {
        const parts = data.split('_');
        const id = parts[1];
        const reasonCode = parts[2];
        const reason = reasonCode === 'sokinish' ? "So'kinish" : "Juda hunuk habar";

        let r = reviewsData.find(x => x.id === id);
        if (r) {
            r.status = 'deleted';
            let phone = r.phone;
            if (phone && phone !== 'Noma\'lum') {
                if (!usersData[phone]) usersData[phone] = { warnings: 0 };
                usersData[phone].warnings += 1;
                usersData[phone].lastWarning = reason;
            }
            saveDb();

            let warningsCount = phone && phone !== 'Noma\'lum' ? usersData[phone].warnings : 0;
            adminBot.editMessageText(`Habr saytdan o'chirildi! (${reason})\nOgohlantirishlar: ${warningsCount}/3\n\n${query.message.text}`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Mazza backend listening on port ${PORT}`);
});