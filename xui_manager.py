import json
import requests
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import uuid
import traceback

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class XUIManager:
    def __init__(self, config_path: str = "servers_config.json"):
        with open(config_path, "r", encoding="utf-8") as f:
            self.config = json.load(f)
        self.servers = {s["id"]: s for s in self.config["servers"]}
        self.sessions = {}

    def _get_session(self, server_id: str) -> requests.Session:
        if server_id in self.sessions:
            return self.sessions[server_id]

        server = self.servers.get(server_id)
        if not server:
            raise ValueError(f"Server {server_id} not found")

        session = requests.Session()
        session.verify = False

        base_url = server['address'].rstrip('/')
        login_url = f"{base_url}/login"

        login_data = {
            "username": server["username"],
            "password": server["password"]
        }

        print(f"[DEBUG] Logging in to {base_url}")
        response = session.post(login_url, json=login_data, timeout=10)

        if response.status_code == 200:
            self.sessions[server_id] = session
            print(f"[DEBUG] Login successful for {server_id}")
            return session

        raise Exception(f"Login failed: {response.status_code} - {response.text}")

    def list_inbounds(self, server_id: str) -> List[Dict]:
        try:
            session = self._get_session(server_id)
        except Exception as e:
            print(f"[DEBUG] Failed to get session: {e}")
            return []

        server = self.servers[server_id]
        base_url = server['address'].rstrip('/')
        list_url = f"{base_url}/xui/API/inbounds/list"

        try:
            response = session.get(list_url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("obj"):
                    inbounds = data.get("obj", [])
                    result = []
                    for ib in inbounds:
                        if ib.get("enable") == False:
                            continue
                        result.append({
                            "id": ib.get("id"),
                            "name": ib.get("remark") or f"{ib.get('protocol', 'unknown')}:{ib.get('port', 0)}",
                            "protocol": ib.get("protocol"),
                            "port": ib.get("port"),
                            "enable": ib.get("enable", True)
                        })
                    return result
        except Exception as e:
            print(f"[DEBUG] Error loading inbounds: {e}")

        return []

    def get_all_clients(self, server_id: str) -> List[Dict]:
        try:
            session = self._get_session(server_id)
        except Exception as e:
            print(f"[DEBUG] Failed to get session: {e}")
            return []

        server = self.servers[server_id]
        base_url = server['address'].rstrip('/')
        list_url = f"{base_url}/xui/API/inbounds/list"
        sub_url_base = server.get('sub_url', base_url).rstrip('/')

        all_clients = []

        try:
            response = session.get(list_url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("obj"):
                    inbounds = data.get("obj", [])

                    for ib in inbounds:
                        if ib.get("enable") == False:
                            continue

                        settings = json.loads(ib.get("settings", "{}"))
                        clients = settings.get("clients", [])

                        client_stats = {}
                        for stat in ib.get("clientStats", []):
                            client_stats[stat.get("email")] = {
                                "up": stat.get("up", 0),
                                "down": stat.get("down", 0)
                            }

                        for client in clients:
                            email = client.get("email", "")
                            total_gb = client.get("totalGB", 0) / (1024 ** 3)
                            usage_bytes = client_stats.get(email, {}).get("up", 0) + client_stats.get(email, {}).get("down", 0)
                            usage_gb = usage_bytes / (1024 ** 3)

                            expiry_time = client.get("expiryTime", 0)
                            expiry_date = datetime.fromtimestamp(expiry_time / 1000).isoformat() if expiry_time > 0 else None

                            comment_from_panel = client.get("comment", "")
                            if not comment_from_panel:
                                comment_from_panel = ""

                            sub_id = client.get("subId", "")
                            if not sub_id:
                                sub_id = email

                            subscription_url = f"{sub_url_base}/{sub_id}"

                            all_clients.append({
                                "email": email,
                                "client_id": client.get("id"),
                                "inbound_id": ib.get("id"),
                                "inbound_name": ib.get("remark", f"Inbound {ib.get('id')}"),
                                "protocol": ib.get("protocol"),
                                "port": ib.get("port"),
                                "total_gb": round(total_gb, 2),
                                "used_gb": round(usage_gb, 2),
                                "remaining_gb": round(max(0, total_gb - usage_gb), 2),
                                "usage_percent": round((usage_gb / total_gb * 100) if total_gb > 0 else 0, 1),
                                "enable": client.get("enable", True),
                                "expiry_date": expiry_date,
                                "created_at": client.get("created_at"),
                                "sub_id": sub_id,
                                "subscription_url": subscription_url,
                                "comment": comment_from_panel
                            })

                print(f"[DEBUG] Found {len(all_clients)} clients on server {server['name']}")
        except Exception as e:
            print(f"[DEBUG] Error loading clients: {e}")
            traceback.print_exc()

        return all_clients

    def update_client_comment(self, server_id: str, inbound_id: int, client_id: str, comment: str) -> bool:
        try:
            session = self._get_session(server_id)
            server = self.servers[server_id]
            base_url = server['address'].rstrip('/')

            get_url = f"{base_url}/xui/API/inbounds/get/{inbound_id}"
            response = session.get(get_url, timeout=10)

            if response.status_code != 200:
                return False

            inbound_data = response.json()
            if not inbound_data.get("success"):
                return False

            inbound_obj = inbound_data.get("obj", {})
            settings = json.loads(inbound_obj.get("settings", "{}"))
            clients = settings.get("clients", [])

            for i, c in enumerate(clients):
                if c.get("id") == client_id:
                    clients[i]["comment"] = comment
                    break

            settings["clients"] = clients

            update_url = f"{base_url}/panel/api/inbounds/updateClient/{client_id}"
            update_data = {
                "id": inbound_id,
                "settings": json.dumps(settings)
            }

            response = session.post(update_url, json=update_data, timeout=10)
            return response.status_code == 200

        except Exception as e:
            print(f"[DEBUG] Error updating comment: {e}")
            return False

    def update_client_status(self, server_id: str, inbound_id: int, client_id: str, enable: bool) -> bool:
        try:
            session = self._get_session(server_id)
            server = self.servers[server_id]
            base_url = server['address'].rstrip('/')
            
            print(f"[DEBUG] Toggle client: server={server_id}, inbound={inbound_id}, client={client_id}, enable={enable}")
            
            toggle_url = f"{base_url}/panel/api/inbounds/{inbound_id}/updateClientStatus/{client_id}"
            try:
                resp = session.post(toggle_url, json={"enable": enable}, timeout=10)
                if resp.status_code == 200:
                    result = resp.json()
                    if result.get("success"):
                        print("[DEBUG] Toggled via updateClientStatus")
                        return True
            except Exception as e:
                print(f"[DEBUG] updateClientStatus exception: {e}")
            
            # Получаем данные ТОЛЬКО этого клиента
            print("[DEBUG] Getting current client data...")
            get_url = f"{base_url}/xui/API/inbounds/get/{inbound_id}"
            resp = session.get(get_url, timeout=10)
            if resp.status_code != 200:
                return False
            
            inbound_data = resp.json()
            if not inbound_data.get("success"):
                return False
            
            inbound_obj = inbound_data.get("obj", {})
            settings = json.loads(inbound_obj.get("settings", "{}"))
            clients = settings.get("clients", [])
            
            target_client = None
            for c in clients:
                if c.get("id") == client_id:
                    target_client = c.copy()
                    break
            if not target_client:
                return False
            
            target_client["enable"] = enable
            
            update_url = f"{base_url}/panel/api/inbounds/updateClient/{client_id}"
            update_payload = {
                "id": inbound_id,
                "settings": json.dumps({"clients": [target_client]})
            }
            
            resp2 = session.post(update_url, json=update_payload, timeout=10)
            if resp2.status_code == 200:
                result = resp2.json()
                return result.get("success", False)
            return False
                
        except Exception as e:
            print(f"[DEBUG] Error updating client status: {e}")
            traceback.print_exc()
            return False

    def update_client_settings(self, server_id: str, inbound_id: int, client_id: str, 
                               traffic_gb: Optional[int] = None, expiry_days: Optional[int] = None, 
                               comment: Optional[str] = None, email: Optional[str] = None, 
                               sub_url: Optional[str] = None) -> bool:
        try:
            session = self._get_session(server_id)
            server = self.servers[server_id]
            base_url = server['address'].rstrip('/')

            # Получаем текущего клиента
            get_url = f"{base_url}/xui/API/inbounds/get/{inbound_id}"
            response = session.get(get_url, timeout=10)

            if response.status_code != 200:
                print(f"[DEBUG] Failed to get inbound: {response.status_code}")
                return False

            inbound_data = response.json()
            if not inbound_data.get("success"):
                print(f"[DEBUG] Inbound get failed: {inbound_data}")
                return False

            inbound_obj = inbound_data.get("obj", {})
            settings = json.loads(inbound_obj.get("settings", "{}"))
            clients = settings.get("clients", [])

            target_client = None
            for c in clients:
                if c.get("id") == client_id:
                    target_client = c.copy()
                    break

            if not target_client:
                print(f"[DEBUG] Client {client_id} not found")
                return False

            # Применяем изменения к копии
            if traffic_gb is not None:
                target_client["totalGB"] = traffic_gb * 1024 * 1024 * 1024
                print(f"[DEBUG] Updated traffic to {traffic_gb} GB")

            if expiry_days is not None:
                if expiry_days > 0:
                    expiry_time = datetime.now() + timedelta(days=expiry_days)
                    target_client["expiryTime"] = int(expiry_time.timestamp() * 1000)
                    print(f"[DEBUG] Updated expiry to {expiry_days} days")
                else:
                    target_client["expiryTime"] = 0
                    print(f"[DEBUG] Updated expiry to unlimited")

            if comment is not None:
                target_client["comment"] = comment
                print(f"[DEBUG] Updated comment to: {comment}")

            # Обновляем email ТОЛЬКО если он изменился и не пустой
            if email is not None and email != "" and email != target_client.get("email", ""):
                # Не проверяем дубликаты, надеемся, что панель сама проверит
                target_client["email"] = email
                print(f"[DEBUG] Updated email to: {email}")
                # Если sub_url не задан, обновляем subId тем же значением
                if sub_url is None or sub_url == "":
                    target_client["subId"] = email
                    print(f"[DEBUG] Also updated subId to: {email}")

            if sub_url is not None:
                if sub_url != "":
                    target_client["subId"] = sub_url
                    print(f"[DEBUG] Updated subId to: {sub_url}")
                elif email is not None and email != "" and email != target_client.get("email", ""):
                    target_client["subId"] = email
                    print(f"[DEBUG] Set subId from new email: {email}")
                else:
                    print(f"[DEBUG] subId unchanged or not updated")

            # Отправляем обновление ТОЛЬКО этого клиента
            update_url = f"{base_url}/panel/api/inbounds/updateClient/{client_id}"
            update_payload = {
                "id": inbound_id,
                "settings": json.dumps({"clients": [target_client]})
            }

            print(f"[DEBUG] Sending update for single client to {update_url}")
            resp = session.post(update_url, json=update_payload, timeout=10)

            if resp.status_code == 200:
                result = resp.json()
                if result.get("success"):
                    print(f"[DEBUG] Client updated successfully")
                    return True
                else:
                    print(f"[DEBUG] Update failed: {result}")
                    return False
            else:
                print(f"[DEBUG] Update HTTP error: {resp.status_code}, body: {resp.text[:200]}")
                return False

        except Exception as e:
            print(f"[DEBUG] Error updating settings: {e}")
            traceback.print_exc()
            return False

    def delete_client(self, server_id: str, inbound_id: int, client_id: str) -> bool:
        try:
            session = self._get_session(server_id)
            server = self.servers[server_id]
            base_url = server['address'].rstrip('/')

            delete_url = f"{base_url}/panel/api/inbounds/{inbound_id}/delClient/{client_id}"
            response = session.post(delete_url, timeout=10)
            return response.status_code == 200

        except Exception as e:
            print(f"[DEBUG] Error deleting client: {e}")
            return False

    def create_client(
        self, 
        server_id: str, 
        inbound_id: int, 
        email: str, 
        traffic_gb: int = 100, 
        expiry_days: int = 30, 
        enable: bool = True, 
        comment: str = ""
    ) -> Dict[str, Any]:
        session = self._get_session(server_id)
        server = self.servers[server_id]

        base_url = server['address'].rstrip('/')

        if not email:
            email = f"user_{uuid.uuid4().hex[:8]}@happ.user"

        if expiry_days > 0:
            expiry_time = datetime.now() + timedelta(days=expiry_days)
            expiry_timestamp = int(expiry_time.timestamp() * 1000)
        else:
            expiry_timestamp = 0

        total_bytes = traffic_gb * 1024 * 1024 * 1024
        client_uuid = str(uuid.uuid4())

        add_data = {
            "id": inbound_id,
            "settings": json.dumps({
                "clients": [{
                    "id": client_uuid,
                    "email": email,
                    "limitIp": 0,
                    "totalGB": total_bytes,
                    "expiryTime": expiry_timestamp,
                    "enable": enable,
                    "tgId": "",
                    "subId": email,
                    "comment": comment
                }]
            })
        }

        add_url = f"{base_url}/panel/api/inbounds/addClient"

        try:
            response = session.post(add_url, json=add_data, timeout=10)
            print(f"[DEBUG] Add client response: {response.status_code}")
            if response.status_code != 200:
                print(f"[DEBUG] Response body: {response.text[:500]}")
        except Exception as e:
            print(f"[DEBUG] Error adding client: {e}")
            raise

        sub_url_base = server.get('sub_url', base_url).rstrip('/')
        subscription_url = f"{sub_url_base}/{email}"

        print(f"[DEBUG] Subscription URL: {subscription_url}")

        inbound_name = f"Inbound_{inbound_id}"
        try:
            list_url = f"{base_url}/xui/API/inbounds/list"
            response = session.get(list_url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("obj"):
                    for ib in data.get("obj", []):
                        if ib.get("id") == inbound_id:
                            inbound_name = ib.get("remark", inbound_name)
                            break
        except:
            pass

        return {
            "client_id": client_uuid,
            "email": email,
            "traffic_gb": traffic_gb,
            "expiry_date": expiry_time.isoformat() if expiry_days > 0 else None,
            "inbound_id": inbound_id,
            "inbound_name": inbound_name,
            "server_name": server["name"],
            "subscription_url": subscription_url
        }
