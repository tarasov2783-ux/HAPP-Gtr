import json
import requests
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import base64


class XUIManager:
    def __init__(self, config_path: str = "servers_config.json"):
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = json.load(f)
        self.servers = {s["id"]: s for s in self.config["servers"]}
        self.sessions = {}

    def _get_session(self, server_id: str) -> requests.Session:
        """Получить сессию с авторизацией для сервера"""
        if server_id in self.sessions:
            return self.sessions[server_id]

        server = self.servers.get(server_id)
        if not server:
            raise ValueError(f"Server {server_id} not found")

        session = requests.Session()
        
        # Логин в 3x-ui
        login_url = f"{server['address']}/login"
        login_data = {
            "username": server["username"],
            "password": server["password"]
        }
        
        try:
            response = session.post(login_url, json=login_data, timeout=10)
            if response.status_code != 200:
                raise Exception(f"Login failed: {response.text}")
        except Exception as e:
            raise Exception(f"Cannot connect to {server['name']}: {e}")

        self.sessions[server_id] = session
        return session

    def create_client(
        self,
        server_id: str,
        inbound_id: int,
        email: str,
        traffic_gb: int = 100,
        expiry_days: int = 30,
        enable: bool = True
    ) -> Dict[str, Any]:
        """Создать клиента на сервере"""
        session = self._get_session(server_id)
        server = self.servers[server_id]
        
        # Находим inbound
        inbound = next((i for i in server["inbounds"] if i["id"] == inbound_id), None)
        if not inbound:
            raise ValueError(f"Inbound {inbound_id} not found on {server['name']}")
        
        # Вычисляем дату окончания
        expiry_time = datetime.now() + timedelta(days=expiry_days)
        expiry_timestamp = int(expiry_time.timestamp() * 1000)
        
        # Конвертируем трафик в байты
        total_bytes = traffic_gb * 1024 * 1024 * 1024
        
        # Создаем клиента
        add_url = f"{server['address']}/xui/API/inbound/addClient"
        
        client_data = {
            "id": inbound_id,
            "settings": json.dumps({
                "clients": [{
                    "id": self._generate_uuid(),
                    "email": email,
                    "limitIp": 0,
                    "totalGB": total_bytes,
                    "expiryTime": expiry_timestamp,
                    "enable": enable,
                    "tgId": "",
                    "subId": ""
                }]
            })
        }
        
        response = session.post(add_url, json=client_data, timeout=10)
        
        if response.status_code != 200:
            raise Exception(f"Failed to create client: {response.text}")
        
        result = response.json()
        if result.get("success") != True:
            raise Exception(f"API error: {result}")
        
        # Получаем ссылку для подключения
        client_id = client_data["settings"]["clients"][0]["id"]
        link = self._get_client_link(server_id, inbound_id, client_id)
        
        return {
            "client_id": client_id,
            "email": email,
            "traffic_gb": traffic_gb,
            "expiry_date": expiry_time.isoformat(),
            "inbound_id": inbound_id,
            "inbound_name": inbound["name"],
            "server_name": server["name"],
            "link": link
        }
    
    def _generate_uuid(self) -> str:
        """Генерация UUID v4"""
        import uuid
        return str(uuid.uuid4())
    
    def _get_client_link(self, server_id: str, inbound_id: int, client_id: str) -> str:
        """Получить ссылку для подключения клиента"""
        session = self._get_session(server_id)
        server = self.servers[server_id]
        
        # Получаем конфиг inbound
        get_url = f"{server['address']}/xui/API/inbound/get/{inbound_id}"
        response = session.get(get_url, timeout=10)
        
        if response.status_code != 200:
            return ""
        
        data = response.json()
        if not data.get("success"):
            return ""
        
        inbound_config = data.get("obj", {})
        protocol = inbound_config.get("protocol", "")
        settings = json.loads(inbound_config.get("settings", "{}"))
        stream_settings = json.loads(inbound_config.get("streamSettings", "{}"))
        
        # Находим клиента
        client = None
        for c in settings.get("clients", []):
            if c.get("id") == client_id:
                client = c
                break
        
        if not client:
            return ""
        
        # Формируем ссылку в зависимости от протокола
        if protocol == "vless":
            return self._build_vless_link(
                server["address"], inbound_config, client, stream_settings
            )
        elif protocol == "vmess":
            return self._build_vmess_link(
                server["address"], inbound_config, client, stream_settings
            )
        elif protocol == "trojan":
            return self._build_trojan_link(
                server["address"], inbound_config, client, stream_settings
            )
        elif protocol == "shadowsocks":
            return self._build_ss_link(
                server["address"], inbound_config, client, stream_settings
            )
        
        return ""
    
    def _build_vless_link(self, address: str, inbound: Dict, client: Dict, stream: Dict) -> str:
        """Построить VLESS ссылку"""
        import urllib.parse
        
        # Парсим адрес
        addr_clean = address.replace("https://", "").replace("http://", "")
        
        # Получаем параметры
        port = inbound.get("port", 443)
        flow = client.get("flow", "")
        encryption = client.get("encryption", "none")
        security = stream.get("security", "tls")
        network = stream.get("network", "tcp")
        
        # Параметры для разных типов
        params = {
            "encryption": encryption,
            "security": security,
            "type": network,
            "flow": flow,
            "sni": stream.get("settings", {}).get("serverName", ""),
            "fp": "chrome"
        }
        
        if network == "ws":
            ws_settings = stream.get("wsSettings", {})
            params["path"] = ws_settings.get("path", "/")
            params["host"] = ws_settings.get("headers", {}).get("Host", "")
        elif network == "grpc":
            grpc_settings = stream.get("grpcSettings", {})
            params["serviceName"] = grpc_settings.get("serviceName", "")
        
        # Убираем пустые параметры
        params = {k: v for k, v in params.items() if v}
        
        query = urllib.parse.urlencode(params)
        fragment = client.get("email", "")
        
        return f"vless://{client['id']}@{addr_clean}:{port}?{query}#{fragment}"
    
    def _build_vmess_link(self, address: str, inbound: Dict, client: Dict, stream: Dict) -> str:
        """Построить VMESS ссылку"""
        import base64
        
        addr_clean = address.replace("https://", "").replace("http://", "")
        
        vmess_config = {
            "v": "2",
            "ps": client.get("email", ""),
            "add": addr_clean,
            "port": inbound.get("port", 443),
            "id": client["id"],
            "aid": "0",
            "net": stream.get("network", "tcp"),
            "type": "none",
            "host": "",
            "path": "",
            "tls": "tls" if stream.get("security") == "tls" else ""
        }
        
        # Добавляем параметры для WebSocket
        if vmess_config["net"] == "ws":
            ws_settings = stream.get("wsSettings", {})
            vmess_config["path"] = ws_settings.get("path", "/")
            vmess_config["host"] = ws_settings.get("headers", {}).get("Host", "")
        
        # Добавляем параметры для gRPC
        if vmess_config["net"] == "grpc":
            grpc_settings = stream.get("grpcSettings", {})
            vmess_config["path"] = grpc_settings.get("serviceName", "")
        
        vmess_json = json.dumps(vmess_config, separators=(",", ":"))
        vmess_b64 = base64.b64encode(vmess_json.encode()).decode()
        
        return f"vmess://{vmess_b64}"
    
    def _build_trojan_link(self, address: str, inbound: Dict, client: Dict, stream: Dict) -> str:
        """Построить Trojan ссылку"""
        addr_clean = address.replace("https://", "").replace("http://", "")
        password = client.get("password", client.get("id", ""))
        sni = stream.get("settings", {}).get("serverName", "")
        
        # Trojan URL: trojan://password@address:port?allowInsecure=1&sni=domain#name
        params = []
        if sni:
            params.append(f"sni={sni}")
        if params:
            query = "?" + "&".join(params)
        else:
            query = ""
        
        fragment = client.get("email", "")
        
        return f"trojan://{password}@{addr_clean}:{inbound.get('port', 443)}{query}#{fragment}"
    
    def _build_ss_link(self, address: str, inbound: Dict, client: Dict, stream: Dict) -> str:
        """Построить Shadowsocks ссылку"""
        import base64
        
        addr_clean = address.replace("https://", "").replace("http://", "")
        
        # Формат: ss://method:password@address:port#name
        method = inbound.get("method", "chacha20-ietf-poly1305")
        password = client.get("password", client.get("id", ""))
        
        userinfo = f"{method}:{password}"
        userinfo_b64 = base64.b64encode(userinfo.encode()).decode()
        
        fragment = client.get("email", "")
        
        return f"ss://{userinfo_b64}@{addr_clean}:{inbound.get('port', 443)}#{fragment}"
    
    def list_inbounds(self, server_id: str) -> List[Dict]:
        """Получить список inbound'ов на сервере"""
        session = self._get_session(server_id)
        server = self.servers[server_id]
        
        list_url = f"{server['address']}/xui/API/inbounds/list"
        response = session.get(list_url, timeout=10)
        
        if response.status_code != 200:
            return server["inbounds"]
        
        data = response.json()
        if not data.get("success"):
            return server["inbounds"]
        
        # Обновляем список из API
        inbounds = []
        for inbound in data.get("obj", []):
            inbounds.append({
                "id": inbound["id"],
                "name": inbound["remark"],
                "protocol": inbound["protocol"],
                "port": inbound["port"],
                "default": False
            })
        
        # Добавляем флаг default из конфига
        for inbound in inbounds:
            for cfg in server["inbounds"]:
                if cfg["id"] == inbound["id"] and cfg.get("default"):
                    inbound["default"] = True
                    break
        
        return inbounds
