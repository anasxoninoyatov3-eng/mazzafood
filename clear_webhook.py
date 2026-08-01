import os
import urllib.request

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

tokens = [t for t in [os.getenv('TELEGRAM_BOT_TOKEN'), os.getenv('ADMIN_BOT_TOKEN')] if t]

for token in tokens:
    try:
        url = f"https://api.telegram.org/bot{token}/deleteWebhook?drop_pending_updates=true"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            print(f"Token {token[:10]}... : {response.read().decode('utf-8')}")
    except Exception as e:
        print(f"Error for {token[:10]}: {e}")
