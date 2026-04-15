import base64
import json
import requests
from typing import Any, Dict, Optional

API_URL = "https://crypto.happ.su/api-v2.php"


def create_happ_crypto_link(content: str, version: str = "v4", as_link: bool = True, timeout: int = 20) -> str:
    """
    Создает зашифрованную happ-ссылку для подписки.
    Использует API и возвращает ссылку в том виде, в котором её отдает API.
    """
    # Пробуем разные форматы payload как в рабочем сервисе
    payloads = [
        {"url": content, "version": "v4", "asLink": True},
        {"link": content, "version": "v4", "asLink": True},
        {"content": content, "version": "v4", "asLink": True},
        {"text": content, "version": "v4", "asLink": True},
        {"data": content, "version": "v4", "asLink": True},
    ]
    
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    
    for payload in payloads:
        try:
            print(f"[DEBUG] Trying payload: {json.dumps(payload)}")
            response = requests.post(API_URL, headers=headers, json=payload, timeout=timeout)
            print(f"[DEBUG] Response status: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    # Ищем encrypted_link или link
                    if isinstance(data, dict):
                        # Сначала ищем encrypted_link
                        if "encrypted_link" in data:
                            result = data["encrypted_link"]
                            if result.startswith("happ://crypt"):
                                print(f"[DEBUG] Found encrypted_link: {result[:50]}...")
                                return result
                        # Потом ищем link
                        if "link" in data:
                            result = data["link"]
                            if result.startswith("happ://crypt"):
                                print(f"[DEBUG] Found link: {result[:50]}...")
                                return result
                        # Ищем в любом значении
                        for key, value in data.items():
                            if isinstance(value, str) and value.startswith("happ://crypt"):
                                print(f"[DEBUG] Found in {key}: {value[:50]}...")
                                return value
                except json.JSONDecodeError:
                    if response.text.startswith("happ://crypt"):
                        print(f"[DEBUG] Found in text: {response.text[:50]}...")
                        return response.text
        except Exception as e:
            print(f"[DEBUG] Error: {e}")
            continue
    
    # Если API не работает, используем локальное кодирование
    print(f"[WARNING] API failed, using local encoding")
    encoded = base64.b64encode(content.encode()).decode()
    return f"happ://crypt5/{encoded}"


def createHappCryptoLink(content: str, version: str = "v4", as_link: bool = True) -> str:
    return create_happ_crypto_link(content, version=version, as_link=as_link)


if __name__ == "__main__":
    test_url = "https://food.netka.name:2096/sublink/test123"
    result = create_happ_crypto_link(test_url)
    print(f"URL: {test_url}")
    print(f"Result: {result}")
