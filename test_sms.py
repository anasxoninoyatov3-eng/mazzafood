import os
import asyncio
import aiohttp
import urllib.parse
from dotenv import load_dotenv

load_dotenv()

SMS_API_KEY = os.getenv('SMS_API_KEY', '')
ESKIZ_EMAIL = os.getenv('ESKIZ_EMAIL', '')
ESKIZ_PASSWORD = os.getenv('ESKIZ_PASSWORD', '')
ESKIZ_FROM = os.getenv('ESKIZ_FROM', 'MazzaFood')

async def send_sms_smsmobileapi(phone: str, code: str):
    """SMSMobileAPI orqali SMS yuborish"""
    clean_phone = ''.join(filter(str.isdigit, phone))
    text = f"Mazza Food: Tasdiqlash kodi - {code}"
    encoded_text = urllib.parse.quote(text)
    url = f"https://api.smsmobileapi.com/sendsms/?recipients={clean_phone}&message={encoded_text}&apikey={SMS_API_KEY}"
    
    print(f"📱 SMSMobileAPI orqali yuborilmoqda: {clean_phone}...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                result = await resp.text()
                print(f"✅ SMSMobileAPI Javob: {result.strip()}")
                return True
    except Exception as e:
        print(f"❌ Xatolik: {e}")
        return False

async def send_sms_eskiz(phone: str, code: str):
    """Eskiz.uz API orqali SMS yuborish"""
    clean_phone = ''.join(filter(str.isdigit, phone))
    text = f"Mazza Food: Tasdiqlash kodi - {code}"
    
    print(f"📱 Eskiz.uz orqali yuborilmoqda: {clean_phone}...")
    try:
        async with aiohttp.ClientSession() as session:
            # 1. Auth Login (Token olish)
            login_url = "https://notify.eskiz.uz/api/auth/login"
            login_data = {
                'email': ESKIZ_EMAIL,
                'password': ESKIZ_PASSWORD
            }
            async with session.post(login_url, data=login_data) as resp:
                res_data = await resp.json()
                token = res_data.get('data', {}).get('token')
                if not token:
                    print(f"❌ Token olishda xatolik: {res_data}")
                    return False
                print("🔑 Eskiz token olindi")
            
            # 2. Send SMS
            send_url = "https://notify.eskiz.uz/api/message/sms/send"
            headers = {'Authorization': f'Bearer {token}'}
            payload = {
                'mobile_phone': clean_phone,
                'message': text,
                'from': ESKIZ_FROM
            }
            async with session.post(send_url, headers=headers, data=payload) as resp:
                send_res = await resp.json()
                print(f"✅ Eskiz Javob ({resp.status}): {send_res}")
                if resp.status == 200 and send_res.get('status') in ['waiting', 'success', 'sended']:
                    return True
                
                # Test payload retry
                print("🔄 Eskiz test rejimida urunib ko'rilmoqda ('Bu Eskiz dan test')...")
                test_payload = {
                    'mobile_phone': clean_phone,
                    'message': 'Bu Eskiz dan test',
                    'from': ESKIZ_FROM
                }
                async with session.post(send_url, headers=headers, data=test_payload) as t_resp:
                    t_res = await t_resp.json()
                    print(f"✅ Eskiz Test Mode Javob ({t_resp.status}): {t_res}")
                    return t_resp.status == 200
    except Exception as e:
        print(f"❌ Eskiz Xatolik: {e}")
        return False

if __name__ == "__main__":
    target_phone = "+998908527775"
    test_code = "4829"
    
    print("=== ESKIZ SMS TESTI ===")
    asyncio.run(send_sms_eskiz(target_phone, test_code))
    
    print("\n=== SMSMOBILEAPI TESTI ===")
    asyncio.run(send_sms_smsmobileapi(target_phone, test_code))


