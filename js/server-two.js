const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

try { require('dotenv').config(); } catch (e) {}

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files (if you want to host frontend from same server)
app.use(express.static(path.join(__dirname)));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// POST /api/send-order
// Body: { order: { id, name, phone, address, items, total, ts } }
app.post('/api/send-order', async (req, res) => {
  try {
    const { order } = req.body || {};
    if (!order || !order.name || !order.phone) return res.status(400).json({ ok: false, error: 'Missing order data' });

    const BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_IDS = process.env.TELEGRAM_CHAT_ID ? [process.env.TELEGRAM_CHAT_ID] : [8283401187];

    if (!BOT_TOKEN || CHAT_IDS.length === 0) return res.status(500).json({ ok: false, error: 'Telegram credentials not configured' });

    // Build message text (HTML)
    let text = `<b>📦 Yangi buyurtma!</b>\n\n`;
    text += `👤 <b>Mijoz:</b> ${order.name}\n`;
    text += `📞 <b>Telefon:</b> ${order.phone}\n`;
    text += `📍 <b>Manzil:</b> ${order.address || '-'}\n\n`;
    text += `<b>🛒 Buyurtma tarkibi:</b>\n`;

    try {
      const items = order.items || {};
      Object.keys(items).forEach(k => {
        const it = items[k];
        text += `▫️ ${it.name} × ${it.qty} = ${it.price * it.qty} so'm\n`;
      });
    } catch (e) {
      text += '(mahsulotlarni o\'qib bo\'lmadi)\n';
    }

    const delivery = order.delivery || {};
    const deliveryMethod = delivery.method === 'pickup' ? 'Olib ketish' : (delivery.method || 'Standard');
    text += `\n🚚 <b>Yetkazib berish:</b> ${deliveryMethod}`;
    if (delivery.fee) text += ` (${delivery.fee} so'm)`;

    text += `\n\n💰 <b>Jami:</b> ${order.total || 0} so'm`;
    text += `\n🕒 <b>Vaqt:</b> ${new Date(order.ts || Date.now()).toLocaleString()}`;

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    // Send to all CHAT_IDS
    const sendPromises = CHAT_IDS.map(chatId => {
      return axios.post(url, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      }).catch(err => {
        console.error(`Failed to send to ${chatId}:`, err.message);
        return null;
      });
    });

    await Promise.all(sendPromises);

    return res.json({ ok: true, sent_to: CHAT_IDS.length });
  } catch (err) {
    console.error('send-order error:', err && err.message || err);
    return res.status(500).json({ ok: false, error: (err && err.message) || String(err) });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}. POST /api/send-order to forward orders to Telegram.`);
});
