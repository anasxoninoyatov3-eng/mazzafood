import os
import asyncio
from aiogram import Bot

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ADMIN_BOT_TOKEN = os.getenv('ADMIN_BOT_TOKEN', '')
ADMIN_CHAT_ID = int(os.getenv('ADMIN_CHAT_ID', '8283401187'))

async def main():
    bot = Bot(token=ADMIN_BOT_TOKEN)
    try:
        await bot.send_message(ADMIN_CHAT_ID, '🚨 <b>Yangi test!</b>', parse_mode='HTML')
        print('SUCCESS')
    except Exception as e:
        print('ERROR:', str(e))
    finally:
        await bot.session.close()

if __name__ == '__main__':
    asyncio.run(main())
