"""
Composio multi-channel social messaging integration tests.

Covers:
- /api/composio/status (3 channels, plan_allows for premium/founder)
- /api/composio/connect/* returns 503 since COMPOSIO_API_KEY is empty
- /api/composio/whatsapp-provider toggle + invalid value 422
- /api/composio/webhook accepts permissive (no secret), upserts contacts,
  unifies on second message, supports messenger/instagram/whatsapp
- /api/composio/send 409 when not connected
- /api/composio/{channel}/disconnect idempotent 200
- regression on /api/crm/* endpoints
"""
import os
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://digiactiva-chile.preview.emergentagent.com"

FOUNDER = {"email": "founder@digiactiva.com", "password": "digiactiva2025"}
PASTA = {"email": "admin@pastaalvuelo.com", "password": "pastaalvuelo2025"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json()["access_token"]


@pytest.fixture(scope="module")
def founder_token():
    return _login(FOUNDER)


@pytest.fixture(scope="module")
def pasta_token():
    return _login(PASTA)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def _contacts_list(resp_json):
    if isinstance(resp_json, list):
        return resp_json
    return resp_json.get("contacts") or []


def _messages_list(resp_json):
    if isinstance(resp_json, list):
        return resp_json
    return resp_json.get("messages") or []


# ---------- STATUS ----------
class TestStatus:
    def test_status_founder(self, founder_token):
        r = requests.get(f"{BASE_URL}/api/composio/status", headers=H(founder_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["plan_allows"] is True
        assert "messenger" in data["channels"]
        assert "instagram" in data["channels"]
        assert "whatsapp" in data["channels"]
        assert data["channels"]["messenger"]["status"] in ("not_connected", "pending", "connected", "error")
        assert data["api_key_configured"] is False  # by design (.env empty)

    def test_status_pasta_premium(self, pasta_token):
        r = requests.get(f"{BASE_URL}/api/composio/status", headers=H(pasta_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["plan"] == "premium"
        assert data["plan_allows"] is True


# ---------- CONNECT (503 because no API key) ----------
class TestConnect503:
    def test_messenger_connect_returns_503(self, founder_token):
        r = requests.post(f"{BASE_URL}/api/composio/connect/messenger", headers=H(founder_token), timeout=15)
        assert r.status_code == 503, r.text
        assert "COMPOSIO_API_KEY" in (r.json().get("detail") or "")


# ---------- WhatsApp provider toggle ----------
class TestWhatsAppProvider:
    def test_set_composio_then_reset(self, pasta_token):
        # set composio
        r = requests.put(
            f"{BASE_URL}/api/composio/whatsapp-provider",
            json={"provider": "composio"},
            headers=H(pasta_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["whatsapp_provider"] == "composio"

        # verify via status
        r2 = requests.get(f"{BASE_URL}/api/composio/status", headers=H(pasta_token), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["whatsapp_provider"] == "composio"

        # reset to cloud_api
        r3 = requests.put(
            f"{BASE_URL}/api/composio/whatsapp-provider",
            json={"provider": "cloud_api"},
            headers=H(pasta_token), timeout=15,
        )
        assert r3.status_code == 200
        assert r3.json()["whatsapp_provider"] == "cloud_api"

    def test_invalid_provider_422(self, pasta_token):
        r = requests.put(
            f"{BASE_URL}/api/composio/whatsapp-provider",
            json={"provider": "telegram"},
            headers=H(pasta_token), timeout=15,
        )
        assert r.status_code == 422, r.text


# ---------- Webhook (permissive dev mode) ----------
class TestWebhook:
    @pytest.fixture(scope="class")
    def digiactiva_id(self, founder_token):
        r = requests.get(f"{BASE_URL}/api/workspaces", headers=H(founder_token), timeout=15)
        assert r.status_code == 200
        for w in r.json()["workspaces"]:
            if w.get("slug") == "digiactiva":
                return w["id"]
        pytest.skip("DigiActiva workspace not found")

    def test_instagram_inbound_creates_contact(self, founder_token, digiactiva_id):
        payload = {
            "type": "composio.trigger.message",
            "metadata": {"trigger_slug": "INSTAGRAM_MESSAGE_RECEIVED"},
            "data": {"sender_id": "insta_test_42", "message": "Hola test", "sender_username": "tester"},
        }
        r = requests.post(
            f"{BASE_URL}/api/composio/webhook",
            params={"ws": digiactiva_id},
            json=payload, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["channel"] == "instagram"
        assert body["contact_id"]
        cid = body["contact_id"]

        # contacts list check — filter by fuente (Contact model strips instagram_id; reported separately)
        rc = requests.get(
            f"{BASE_URL}/api/crm/contacts?fuente=composio_instagram",
            headers=H(founder_token), timeout=15,
        )
        assert rc.status_code == 200
        contacts = _contacts_list(rc.json())
        assert any(c.get("id") == cid for c in contacts), "composio_instagram contact not visible via /api/crm/contacts"
        rm = requests.get(
            f"{BASE_URL}/api/crm/messages/{cid}",
            headers=H(founder_token), timeout=15,
        )
        assert rm.status_code == 200, rm.text
        msgs = _messages_list(rm.json())
        assert any(m.get("channel") == "instagram" and m.get("direction") == "inbound" for m in msgs)

    def test_instagram_dedup_on_second_message(self, founder_token, digiactiva_id):
        # Count first
        rc = requests.get(f"{BASE_URL}/api/crm/contacts?fuente=composio_instagram", headers=H(founder_token), timeout=15)
        before = len(_contacts_list(rc.json()))

        payload = {
            "type": "composio.trigger.message",
            "metadata": {"trigger_slug": "INSTAGRAM_MESSAGE_RECEIVED"},
            "data": {"sender_id": "insta_test_42", "message": "Segundo mensaje", "sender_username": "tester"},
        }
        r = requests.post(
            f"{BASE_URL}/api/composio/webhook",
            params={"ws": digiactiva_id},
            json=payload, timeout=15,
        )
        assert r.status_code == 200

        rc2 = requests.get(f"{BASE_URL}/api/crm/contacts?fuente=composio_instagram", headers=H(founder_token), timeout=15)
        after = len(_contacts_list(rc2.json()))
        assert after == before, f"duplicated contacts: before={before} after={after}"

    def test_messenger_inbound(self, founder_token, digiactiva_id):
        payload = {
            "type": "composio.trigger.message",
            "metadata": {"trigger_slug": "MESSENGER_MESSAGE_RECEIVED"},
            "data": {"sender_id": "msg_xy", "message": "hi", "sender_username": "fbuser"},
        }
        r = requests.post(
            f"{BASE_URL}/api/composio/webhook",
            params={"ws": digiactiva_id},
            json=payload, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["channel"] == "messenger"
        cid = r.json()["contact_id"]

        rc = requests.get(f"{BASE_URL}/api/crm/contacts?fuente=composio_messenger", headers=H(founder_token), timeout=15)
        contacts = _contacts_list(rc.json())
        assert any(c.get("id") == cid for c in contacts)

    def test_whatsapp_inbound_via_composio(self, founder_token, digiactiva_id):
        # Use a unique phone to avoid colliding with pre-existing WA contacts (fuente never overwritten in upsert)
        unique_phone = "+56988888042"
        payload = {
            "type": "composio.trigger.message",
            "metadata": {"trigger_slug": "WHATSAPP_MESSAGE_RECEIVED"},
            "data": {"from": unique_phone, "message": "wa test"},
        }
        r = requests.post(
            f"{BASE_URL}/api/composio/webhook",
            params={"ws": digiactiva_id},
            json=payload, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["channel"] == "whatsapp"
        cid = r.json()["contact_id"]

        rc = requests.get(f"{BASE_URL}/api/crm/contacts?fuente=composio_whatsapp", headers=H(founder_token), timeout=15)
        contacts = _contacts_list(rc.json())
        assert any(c.get("id") == cid for c in contacts), "composio_whatsapp contact not found"


# ---------- Send (no channel connected → 409) ----------
class TestSend:
    def test_send_returns_409(self, founder_token):
        r = requests.post(
            f"{BASE_URL}/api/composio/send",
            json={"channel": "instagram", "to": "abc", "message": "hi"},
            headers=H(founder_token), timeout=15,
        )
        assert r.status_code == 409, r.text


# ---------- Disconnect idempotent ----------
class TestDisconnect:
    def test_messenger_disconnect_idempotent(self, founder_token):
        r = requests.delete(
            f"{BASE_URL}/api/composio/messenger/disconnect",
            headers=H(founder_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True


# ---------- Regression on CRM endpoints ----------
class TestCRMRegression:
    @pytest.mark.parametrize("path", [
        "/api/crm/contacts",
        "/api/crm/metrics",
        "/api/crm/pipeline",
        "/api/crm/settings",
        "/api/crm/ai/logs",
        "/api/crm/ai/priorities",
    ])
    def test_endpoint_200(self, founder_token, path):
        r = requests.get(f"{BASE_URL}{path}", headers=H(founder_token), timeout=15)
        assert r.status_code == 200, f"{path} → {r.status_code}: {r.text[:200]}"
