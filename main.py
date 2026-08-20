import os
import asyncio
import logging
import sys
import json
from typing import Dict, Any
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery, ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext
from aiohttp import web
import urllib.parse
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
ADMIN_BOT_TOKEN = os.getenv('ADMIN_BOT_TOKEN', '')
ADMIN_CHAT_ID = int(os.getenv('ADMIN_CHAT_ID', '8283401187'))
SMS_API_KEY = os.getenv('SMS_API_KEY', '')

async def send_sms_api(phone, otp):
    import aiohttp
    text = f"Mazza Food: Tasdiqlash kodi - {otp}"
    clean_phone = ''.join(filter(str.isdigit, phone))
    encoded_text = urllib.parse.quote(text)
    url = f"https://api.smsmobileapi.com/sendsms/?recipients={clean_phone}&message={encoded_text}&apikey={SMS_API_KEY}"
    logging.info(f"Sending real SMS to {clean_phone}")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                resp_text = await resp.text()
                logging.info(f"SMS API response: {resp_text}")
        await admin_bot.send_message(ADMIN_CHAT_ID, f"📱 *SMS mijozning telefoniga yuborildi ({clean_phone}):*\n{text}\n\nJavob: {resp_text}", parse_mode='Markdown')
        return True
    except Exception as e:
        logging.error(f"Failed to send SMS: {e}")
        return False

otp_store: Dict[str, Dict[str, Any]] = {}

bot = Bot(token=TOKEN)
admin_bot = Bot(token=ADMIN_BOT_TOKEN) 
dp = Dispatcher()

REVIEWS_FILE = 'reviews.json'
if not os.path.exists(REVIEWS_FILE):
    with open(REVIEWS_FILE, 'w') as f:
        json.dump([], f)

USERS_FILE = 'users.json'
if not os.path.exists(USERS_FILE):
    with open(USERS_FILE, 'w') as f:
        json.dump({}, f)

def load_reviews():
    with open(REVIEWS_FILE, 'r') as f:
        return json.load(f)

def save_reviews(reviews):
    with open(REVIEWS_FILE, 'w') as f:
        json.dump(reviews, f)

def load_users() -> Dict[str, Dict[str, Any]]:
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_user_data(chat_id: int, key: str, value: Any):
    users = load_users()
    str_id = str(chat_id)
    if str_id not in users:
        users[str_id] = {}
    users[str_id][key] = value
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, indent=2, ensure_ascii=False)

def get_user_data(chat_id: int) -> Dict[str, Any]:
    users = load_users()
    return users.get(str(chat_id), {})

class Registration(StatesGroup):
    waiting_for_phone = State()
    waiting_for_name = State()
    waiting_for_location = State()

products = {
    'burgers': [
        {'id': 'b1', 'name': 'Cheese Burger', 'price': 35000},
        {'id': 'b2', 'name': 'Mazza Burger', 'price': 38000},
        {'id': 'b3', 'name': 'Twins Burger', 'price': 40000},
        {'id': 'b4', 'name': 'Chicken Burger', 'price': 28000},
        {'id': 'b5', 'name': 'Halapeno Burger', 'price': 33000},
        {'id': 'b6', 'name': 'BBQ Burger', 'price': 32000}
    ],
    'lavash': [
        {'id': 'l1', 'name': 'Lavash Oddiy', 'price': 35000},
        {'id': 'l2', 'name': 'Lavash Mini', 'price': 33000},
        {'id': 'l3', 'name': 'Tandir Lavash', 'price': 40000},
        {'id': 'l4', 'name': 'Shaurma', 'price': 35000}
    ],
    'kfc': [
        {'id': 'k1', 'name': 'Twister', 'price': 33000},
        {'id': 'k2', 'name': 'KFS 1 Porsa', 'price': 25000},
        {'id': 'k3', 'name': 'Tovuqli Sandvich', 'price': 50000},
        {'id': 'k4', 'name': 'Donar Tarelka', 'price': 50000}
    ],
    'hotdog': [
        {'id': 'h1', 'name': 'Oddiy Hot-Dog', 'price': 10000},
        {'id': 'h2', 'name': 'Kanada Hot-Dog', 'price': 12000},
        {'id': 'h3', 'name': 'Qovurilgan Hot-Dog', 'price': 20000},
        {'id': 'h4', 'name': "Go'shtli Hot-Dog", 'price': 30000}
    ],
    'snacks': [
        {'id': 's1', 'name': 'Sharik', 'price': 18000},
        {'id': 's2', 'name': 'Fri', 'price': 18000},
        {'id': 's3', 'name': 'Derevenskiy Fri', 'price': 18000}
    ]
}

flat_products = []
for cat in products.values():
    flat_products.extend(cat)

def get_product_by_id(p_id):
    return next((p for p in flat_products if p['id'] == p_id), None)

sessions: Dict[int, Dict[str, Any]] = {}

def get_session(chat_id: int):
    if chat_id not in sessions:
        sessions[chat_id] = {'cart': {}, 'type': None, 'payment': None}
    return sessions[chat_id]

def get_start_menu():
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text='📜 Menyu (Taomlar)', callback_data='show_categories'))
    builder.row(InlineKeyboardButton(text="🌐 Saytga o'tish", web_app=types.WebAppInfo(url='https://mazza-food.uz/')))
    return builder.as_markup()

def get_categories_menu():
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text='🍔 Burgerlar', callback_data='cat_burgers'), InlineKeyboardButton(text='🥙 Lavash', callback_data='cat_lavash'))
    builder.row(InlineKeyboardButton(text='🌯 KFC', callback_data='cat_kfc'), InlineKeyboardButton(text='🌭 Hot-Doglar', callback_data='cat_hotdog'))
    builder.row(InlineKeyboardButton(text='🍟 Gazaklar', callback_data='cat_snacks'))
    builder.row(InlineKeyboardButton(text='🛒 Savatcha', callback_data='cart_view'))
    builder.row(InlineKeyboardButton(text='🔙 Bosh sahifa', callback_data='back_start'))
    return builder.as_markup()

@dp.message(CommandStart())
async def command_start_handler(message: types.Message, state: FSMContext):
    phone_keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📱 Telefon raqamni yuborish", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True
    )
    await message.answer(
        "Ro'yxatdan o'tish uchun telefon\nraqamingizni kiring.\nRaqamni +************* shaklida yuboring.",
        reply_markup=phone_keyboard
    )
    await state.set_state(Registration.waiting_for_phone)

@dp.message(Registration.waiting_for_phone)
async def process_phone(message: types.Message, state: FSMContext):
    if message.contact:
        phone = message.contact.phone_number
        if not phone.startswith('+'):
            phone = '+' + phone
    elif message.text:
        phone = message.text.strip()
    else:
        await message.answer("Iltimos, telefon raqamingizni yuboring.")
        return

    save_user_data(message.chat.id, 'phone', phone)
    await state.set_state(Registration.waiting_for_name)
    await message.answer(
        "Biz sizga kim deb murojat qilsak bo'ladi ?\nIsmingizni yuboring\n\nMasalan: Sardor",
        reply_markup=ReplyKeyboardRemove()
    )

@dp.message(Registration.waiting_for_name)
async def process_name(message: types.Message, state: FSMContext):
    if not message.text:
        await message.answer("Iltimos, ismingizni matn ko'rinishida yuboring.")
        return

    save_user_data(message.chat.id, 'name', message.text.strip())
    await state.set_state(Registration.waiting_for_location)

    location_keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📍 Geolokatsiyani yuborish", request_location=True)]],
        resize_keyboard=True,
        one_time_keyboard=True
    )
    await message.answer(
        "Iltimos, '📍 Geolokatsiyani yuborish' tugmasini bosish orqali geolokatsiyangizni yuboring. Telefoningizda manzilni aniqlash funksiyasi yoqilgan bo'lishi kerak.",
        reply_markup=location_keyboard
    )

@dp.message(Registration.waiting_for_location)
async def process_location(message: types.Message, state: FSMContext):
    if message.location:
        lat = message.location.latitude
        lon = message.location.longitude
        loc_data = {
            'lat': lat,
            'lon': lon,
            'maps_url': f"https://maps.google.com/?q={lat},{lon}"
        }
        save_user_data(message.chat.id, 'location', loc_data)
    elif message.text:
        save_user_data(message.chat.id, 'location', message.text.strip())
    else:
        await message.answer("Iltimos, geolokatsiyangizni yuboring.")
        return

    await state.clear()
    await message.answer(
        "✅ Ro'yxatdan o'tish muvaffaqiyatli yakunlandi!",
        reply_markup=ReplyKeyboardRemove()
    )
    await message.answer_photo(
        photo='https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1965',
        caption="🍔 *Mazza Foodga xush kelibsiz!*\n\nMenyuni ochish uchun tugmani bosing:",
        parse_mode='Markdown',
        reply_markup=get_start_menu()
    )

@dp.message(Command("menu"))
async def command_menu_handler(message: types.Message):
    await message.answer("😋 *Kategoriyani tanlang:*", parse_mode='Markdown', reply_markup=get_categories_menu())

@dp.message(Command("clear"))
async def command_clear_handler(message: types.Message):
    current_msg_id = message.message_id
    chat_id = message.chat.id
    for msg_id in range(current_msg_id, current_msg_id - 100, -1):
        try:
            await bot.delete_message(chat_id=chat_id, message_id=msg_id)
        except Exception:
            continue
    status_msg = await message.answer("🧹 Chat muvaffaqiyatli tozalandi!")
    await asyncio.sleep(3.5)
    try:
        await bot.delete_message(chat_id=chat_id, message_id=status_msg.message_id)
    except Exception:
        pass
    session = get_session(chat_id)
    session['cart'] = {}

@dp.message(Command("about"))
async def command_about_handler(message: types.Message):
    about_text = (
        "🍕 *PIZZA & KFC & FAST FOOD*\n\n"
        "🍕 *PIZZA буюртма берсангиз етказиб бериш хизмати бепул!!!*\n\n"
        "📍 *Манзил:* Пўстиндўз кўчаси (Спортивные) нон маркази билан ён маён\n\n "
        "💳 *CLICK*\n"
        "`5614 6822 1326 5467` \n"
        "*Xatamkulov Xabibjon*\n\n"
        "🚗 *Доставка хизмати*\n"
        "+99897-201-10-10\n"
        "+99888-201-10-10"
    )
    await message.answer(about_text, parse_mode='Markdown')

@dp.message(Command("commands"))
async def command_list_handler(message: types.Message):
    commands_text = (
        "🤖 *Bot buyruqlari ro'yxati:*\n\n"
        "🚀 /start — Botni ishga tushirish va asosiy menyu\n"
        "🍽 /menu — Taomlar va kategoriyalar menyusi\n"
        "🗑 /clear — Savatchani toliq tozalash\n"
        "ℹ️ /about — Biz haqimizda va aloqa ma'lumotlari\n"
        "📜 /commands — Hozirgi buyruqlar ro'yxati\n"
        "🆔 /id — Sizning Chat ID raqamingiz"
    )
    await message.answer(commands_text, parse_mode='Markdown')

@dp.message(Command("id"))
async def command_id_handler(message: types.Message):
    await message.answer(f"Sizning Chat ID: `{message.chat.id}`", parse_mode='Markdown')

@dp.callback_query(F.data == 'show_categories')
async def show_categories(query: CallbackQuery):
    await query.message.answer("😋 *Kategoriyani tanlang:*", parse_mode='Markdown', reply_markup=get_categories_menu())
    await query.answer()

@dp.callback_query(F.data == 'back_start')
async def back_start(query: CallbackQuery):
    await query.message.answer_photo(
        photo='https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1965',
        caption="🍔 *Mazza Foodga xush kelibsiz!*\n\nMenyuni ochish uchun tugmani bosing:",
        parse_mode='Markdown',
        reply_markup=get_start_menu()
    )
    await query.answer()

@dp.callback_query(F.data.startswith('cat_'))
async def show_category_items(query: CallbackQuery):
    cat_id = query.data.replace('cat_', '')
    items = products.get(cat_id, [])
    builder = InlineKeyboardBuilder()
    for p in items:
        builder.row(InlineKeyboardButton(text=f"➕ {p['name']} - {p['price']} so'm", callback_data=f"add_{p['id']}"))
    builder.row(InlineKeyboardButton(text="🛒 Savatcha", callback_data='cart_view'), InlineKeyboardButton(text='🔙 Orqaga', callback_data='show_categories'))
    await query.message.edit_text("Nima buyurtma qilasiz?", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith('add_'))
async def add_to_cart(query: CallbackQuery):
    p_id = query.data.replace('add_', '')
    p = get_product_by_id(p_id)
    session = get_session(query.message.chat.id)
    if p_id not in session['cart']:
        session['cart'][p_id] = {**p, 'count': 0}
    session['cart'][p_id]['count'] += 1
    await query.answer(text=f"✅ {p['name']} qo'shildi!", show_alert=True)

@dp.callback_query(F.data == 'cart_view')
async def cart_view(query: CallbackQuery):
    session = get_session(query.message.chat.id)
    if not session['cart']:
        await query.answer("Savatcha bo'sh!", show_alert=True)
        return
    text = '*Savatchangiz:*\n\n'
    total = 0
    builder = InlineKeyboardBuilder()
    for p_id, item in session['cart'].items():
        text += f"- {item['name']} x {item['count']} = {item['price'] * item['count']} so'm\n"
        total += item['price'] * item['count']
        builder.row(InlineKeyboardButton(text='➖', callback_data=f"cart_dec_{p_id}"), InlineKeyboardButton(text=f"{item['name']} ({item['count']})", callback_data='noop'), InlineKeyboardButton(text='➕', callback_data=f"cart_inc_{p_id}"))
    text += f"\n*Jami: {total} so'm*"
    builder.row(InlineKeyboardButton(text='🗑 Tozalash', callback_data='cart_clear'), InlineKeyboardButton(text='🚀 Buyurtma', callback_data='checkout_type'))
    await query.message.edit_text(text, parse_mode='Markdown', reply_markup=builder.as_markup())

@dp.callback_query(F.data == 'checkout_type')
async def checkout_type(query: CallbackQuery):
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text='🚚 Dostavka', callback_data='type_delivery'), InlineKeyboardButton(text='🚶‍♂️ Soboy', callback_data='type_pickup'))
    await query.message.edit_text("Yetkazib berish usulini tanlang:", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith('type_'))
async def checkout_payment(query: CallbackQuery):
    session = get_session(query.message.chat.id)
    session['type'] = query.data.replace('type_', '')
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text='💵 Naqd', callback_data='pay_cash'), InlineKeyboardButton(text='💳 Click', callback_data='pay_click'))
    await query.message.edit_text("To'lov usuli:", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith('pay_'))
async def finish_order(query: CallbackQuery):
    chat_id = query.message.chat.id
    session = get_session(chat_id)
    session['payment'] = query.data.replace('pay_', '')
    order_text = "🚨 <b>Yangi Buyurtma!</b>\n\n"
    total = 0
    for p_id, item in session['cart'].items():
        order_text += f"- {item['name']} x {item['count']} = {item['price'] * item['count']} so'm\n"
        total += item['price'] * item['count']
        
    type_map = {'delivery': 'Dostavka', 'pickup': 'Soboy'}
    payment_map = {'cash': 'Naqd', 'click': 'Click'}
    
    usul_text = type_map.get(session.get('type', ''), session.get('type', ''))
    tolov_text = payment_map.get(session.get('payment', ''), session.get('payment', ''))
        
    order_text += f"\n<b>Jami:</b> {total} so'm\n<b>Usul:</b> {usul_text}\n<b>To'lov:</b> {tolov_text}\n"
    
    # Xavfsiz ism va username
    full_name = str(query.from_user.full_name).replace('<', '').replace('>', '')
    username = str(query.from_user.username).replace('<', '').replace('>', '')
    order_text += f"<b>Xaridor:</b> {full_name} (@{username})\n"

    user_info = get_user_data(chat_id)
    if user_info.get('phone'):
        order_text += f"📞 <b>Telefon:</b> <code>{user_info['phone']}</code>\n"
    if user_info.get('name'):
        order_text += f"👤 <b>Murojaat uchun:</b> {user_info['name']}\n"
    if user_info.get('location'):
        loc = user_info['location']
        if isinstance(loc, dict) and 'maps_url' in loc:
            order_text += f"📍 <b>Manzil:</b> <a href='{loc['maps_url']}'>Geolokatsiya (Xaritalarda)</a>\n"
        else:
            order_text += f"📍 <b>Manzil:</b> {loc}\n"
    
    try:
        await admin_bot.send_message(ADMIN_CHAT_ID, order_text, parse_mode='HTML')
        if isinstance(user_info.get('location'), dict) and 'lat' in user_info['location']:
            await admin_bot.send_location(ADMIN_CHAT_ID, latitude=user_info['location']['lat'], longitude=user_info['location']['lon'])
        logging.info("Admin bot successfully sent the order message.")
    except Exception as e:
        logging.error(f"Xabar yuborishda xato: {e}")
    await query.message.edit_text("✅ Buyurtma qabul qilindi! Rahmat.", reply_markup=None)
    session['cart'] = {}
    await query.answer()

pending_reviews = {}

@dp.callback_query(F.data.startswith('rev_'))
async def moderate_review(query: CallbackQuery):
    if query.from_user.id != ADMIN_CHAT_ID:
        await query.answer("Siz admin emassiz!", show_alert=True)
        return
    parts = query.data.split('_')
    action = parts[1]
    ts = parts[2]
    if action == 'approve':
        review = pending_reviews.get(ts)
        if review:
            reviews_list = load_reviews()
            if not any(r.get('ts') == review['ts'] for r in reviews_list):
                reviews_list.append(review)
                save_reviews(reviews_list)
            await query.message.edit_text(
                text=query.message.text + "\n\n✅ *Tasdiqlandi!* Sharh saytda paydo bo'ldi.",
                parse_mode='Markdown'
            )
            del pending_reviews[ts]
        await query.answer("Sharh tasdiqlandi!")
    else:
        if ts in pending_reviews:
            del pending_reviews[ts]
        await query.message.edit_text(
            text=query.message.text + "\n\n❌ *O'chirildi!*",
            parse_mode='Markdown'
        )
        await query.answer("Sharh o'chirildi!")

async def handle_api(request):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    if request.method == 'OPTIONS':
        return web.Response(headers=headers)
    try:
        data = await request.json()
        action = data.get('action')
        logging.info(f"API Request received: {action}")
        if action == 'new_review':
            review = data.get('review')
            ts_str = str(review['ts'])
            pending_reviews[ts_str] = review
            text = (
                f"📝 *Yangi sharh (Moderatsiya)!*\n\n"
                f"👤 Mijoz: *{review['name']}*\n"
                f"⭐ Baho: {review['rating']} / 5\n"
                f"💬 Matn: {review['text']}\n"
            )
            builder = InlineKeyboardBuilder()
            builder.row(
                InlineKeyboardButton(text="✅ Qoldirish", callback_data=f"rev_approve_{ts_str}"),
                InlineKeyboardButton(text="❌ O'chirish", callback_data=f"rev_delete_{ts_str}")
            )
            await admin_bot.send_message(ADMIN_CHAT_ID, text, parse_mode='Markdown', reply_markup=builder.as_markup())
            return web.json_response({'ok': True}, headers=headers)
        if action == 'get_reviews':
            reviews_list = load_reviews()
            return web.json_response({'ok': True, 'reviews': reviews_list}, headers=headers)
        if action == 'submit_order':
            order = data.get('order')
            text = "📦 <b>Yangi buyurtma!</b>\n\n"
            text += f"""👤 Mijoz: <b>{order.get('name', "Noma'lum")}</b>\n"""
            text += f"""📞 Telefon: <code>{order.get('phone', "Noma'lum")}</code>\n"""
            text += f"📍 Manzil: {order.get('address','-')}\n\n"
            text += "🛒 <b>Buyurtma tarkibi:</b>\n"
            items = order.get('items', {})
            for key in items:
                it = items[key]
                text += f"▫️ {it['name']} × {it['qty']} = {it['price'] * it['qty']:,} so'm\n"
            delivery = order.get('delivery', {})
            d_method = "Olib ketish" if delivery.get('method') == 'pickup' else ("Zalda" if delivery.get('method') == 'zalda' else delivery.get('method', 'Yetkazib berish'))
            text += f"\n🚚 Yetkazib berish: <b>{d_method}</b>"
            if delivery.get('fee'):
                text += f" ({delivery['fee']:,} so'm)"
            payment = "💳 Click / Payme" if order.get('payment') == 'click' else "💵 Naqd"
            text += f"\n💳 To'lov turi: <b>{payment}</b>"
            text += f"\n\n💰 <b>Jami: {order.get('total', 0):,} so'm</b>"
            dt = datetime.fromtimestamp(order.get('ts', 0) / 1000)
            text += f"\n🕒 Vaqt: {dt.strftime('%d.%m.%Y, %H:%M:%S')}"
            try:
                await admin_bot.send_message(ADMIN_CHAT_ID, text, parse_mode='HTML')
                logging.info(f"Order {order.get('id')} sent successfully via existing Admin Bot (submit_order)")
            except Exception as e:
                logging.error(f"Failed to send order message (submit_order): {e}")
                raise e
            return web.json_response({'ok': True}, headers=headers)
        return web.json_response({'ok': False, 'error': 'Unknown action'}, headers=headers)
    except Exception as e:
        logging.error(f"API Error: {e}")
        return web.json_response({'ok': False, 'error': str(e)}, headers=headers)

async def handle_send_order(request):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    if request.method == 'OPTIONS':
        return web.Response(headers=headers)
    try:
        data = await request.json()
        order = data.get('order') or data
        text = "📦 <b>Yangi buyurtma!</b>\n\n"
        text += f"""👤 Mijoz: <b>{order.get('name', "Noma'lum")}</b>\n"""
        text += f"""📞 Telefon: <code>{order.get('phone', "Noma'lum")}</code>\n"""
        text += f"📍 Manzil: {order.get('address','-')}\n\n"
        text += "🛒 <b>Buyurtma tarkibi:</b>\n"
        items = order.get('items', {})
        if isinstance(items, dict):
            for key in items:
                it = items[key]
                text += f"▫️ {it['name']} × {it['qty']} = {it['price'] * it['qty']:,} so'm\n"
        elif isinstance(items, list):
            for it in items:
                text += f"▫️ {it['name']} × {it['qty']} = {it['price'] * it['qty']:,} so'm\n"
        delivery = order.get('delivery', {})
        d_method = "Olib ketish" if delivery.get('method') == 'pickup' else ("Zalda" if delivery.get('method') == 'zalda' else delivery.get('method', 'Yetkazib berish'))
        text += f"\n🚚 Yetkazib berish: <b>{d_method}</b>"
        if delivery.get('fee'):
            text += f" ({delivery['fee']:,} so'm)"
        payment = "💳 Click / Payme" if order.get('payment') == 'click' else "💵 Naqd"
        text += f"\n💳 To'lov turi: <b>{payment}</b>"
        text += f"\n\n💰 <b>Jami: {order.get('total', 0):,} so'm</b>"
        dt = datetime.fromtimestamp(order.get('ts', 0) / 1000) if order.get('ts') else datetime.now()
        text += f"\n🕒 Vaqt: {dt.strftime('%d.%m.%Y, %H:%M:%S')}"
        try:
            await admin_bot.send_message(ADMIN_CHAT_ID, text, parse_mode='HTML')
            logging.info(f"Order {order.get('id')} sent successfully via /api/send-order endpoint")
        except Exception as e:
            logging.error(f"Failed to send order via /api/send-order: {e}")
            raise e
        return web.json_response({'ok': True, 'sent_to_admin': True}, headers=headers)
    except Exception as e:
        logging.error(f"/api/send-order Error: {e}")
        return web.json_response({'ok': False, 'error': str(e)}, headers=headers)

async def handle_send_otp(request):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    if request.method == 'OPTIONS':
        return web.Response(headers=headers)
    try:
        data = await request.json()
        phone = str(data.get('phone', '')).strip()
        if not phone or not phone.startswith('+998') or len(phone) < 12:
            return web.json_response({'ok': False, 'error': "Telefon raqami noto'g'ri (+998XXXXXXXXX)"}, headers=headers)
        
        import random, time
        code = str(random.randint(1000, 9999))
        otp_store[phone] = {
            'code': code,
            'created_at': time.time(),
            'expires_at': time.time() + 300,
            'attempts': 0
        }
        logging.info(f"OTP generated for {phone}: {code}")
        sms_ok = await send_sms_api(phone, code)
        return web.json_response({
            'ok': True,
            'message': 'SMS kod yuborildi',
            'smsSent': sms_ok,
            'code': code # Provided for dev/testing feedback
        }, headers=headers)
    except Exception as e:
        logging.error(f"Error in handle_send_otp: {e}")
        return web.json_response({'ok': False, 'error': str(e)}, headers=headers)

async def handle_verify_otp(request):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    if request.method == 'OPTIONS':
        return web.Response(headers=headers)
    try:
        data = await request.json()
        phone = str(data.get('phone', '')).strip()
        code = str(data.get('code', '')).strip()
        import time
        record = otp_store.get(phone)
        if not record:
            return web.json_response({'ok': False, 'error': "SMS kod topilmadi yoki muddati o'tgan. Qaytadan kod so'rang."}, headers=headers)
        if time.time() > record['expires_at']:
            otp_store.pop(phone, None)
            return web.json_response({'ok': False, 'error': "SMS kod muddati tugagan (5 min). Qaytadan kod so'rang."}, headers=headers)
        if record['attempts'] >= 5:
            otp_store.pop(phone, None)
            return web.json_response({'ok': False, 'error': "Juda ko'p xato urinishlar qilindi. Yangi kod so'rang."}, headers=headers)
        if record['code'] != code:
            record['attempts'] += 1
            return web.json_response({'ok': False, 'error': "SMS kod noto'g'ri. Qayta urinib ko'ring."}, headers=headers)
        
        otp_store.pop(phone, None)
        return web.json_response({'ok': True, 'message': 'Nomer muvaffaqiyatli tasdiqlandi!'}, headers=headers)
    except Exception as e:
        logging.error(f"Error in handle_verify_otp: {e}")
        return web.json_response({'ok': False, 'error': str(e)}, headers=headers)

async def handle_options(request):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    return web.Response(headers=headers)

async def handle(request):
    return web.Response(text="Bot is running smoothly on Web Service mode!")

async def self_ping():
    # Sayt to'liq ishga tushib olishi uchun 15 soniya kutamiz
    await asyncio.sleep(15)
    url = os.environ.get("RENDER_EXTERNAL_URL")
    if not url:
        logging.warning("RENDER_EXTERNAL_URL muhit o'zgaruvchisi (environment variable) topilmadi. Avtomatik self-ping o'chirildi.")
        return
    
    logging.info(f"Avtomatik self-ping ishga tushdi. Manzil: {url}")
    import aiohttp
    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    logging.info(f"Self-ping muvaffaqiyatli bajarildi: Status {response.status}")
        except Exception as e:
            logging.error(f"Self-ping xatoligi: {e}")
        # Har 10 daqiqada ping qilamiz (Render 15 daqiqadan keyin o'chadi)
        await asyncio.sleep(600)

async def make_app():
    app = web.Application()
    app.router.add_get('/', handle)
    app.router.add_post('/api', handle_api)
    app.router.add_options('/api', handle_options)
    app.router.add_post('/api/send-order', handle_send_order)
    app.router.add_options('/api/send-order', handle_options)
    app.router.add_post('/api/send-otp', handle_send_otp)
    app.router.add_options('/api/send-otp', handle_options)
    app.router.add_post('/api/verify-otp', handle_verify_otp)
    app.router.add_options('/api/verify-otp', handle_options)
    return app

async def main():
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    app = await make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 10000))
    site = web.TCPSite(runner, '0.0.0.0', port)
    
    # Self-ping taskini yaratamiz
    ping_task = asyncio.create_task(self_ping())
    
    await asyncio.gather(
        site.start(),
        dp.start_polling(bot),
        ping_task
    )

if __name__ == "__main__":
    asyncio.run(main())
