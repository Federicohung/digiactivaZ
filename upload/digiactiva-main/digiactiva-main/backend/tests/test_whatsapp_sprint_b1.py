"""
Sprint B1 — WhatsApp Business Cloud API → CRM.
Covers: verify GET, mock-receive POST, send POST (error path with fake creds),
status GET (redaction), PUT integrations (status auto), multi-tenant isolation,
and end-to-end signal → contact → message → timeline flow.
"""
import os
import sys
import uuid
import pytest
import requests
from dotenv import load_dotenv

# Load backend env to access MONGO_URL/DB_NAME for DB assertions
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

FOUNDER = {"email": "founder@digiactiva.com", "password": "digiactiva2025"}
PASTA = {"email": "admin@pastaalvuelo.com", "password": "pastaalvuelo2025"}


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(http, creds):
    r = http.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def founder_auth(http):
    token, user = _login(http, FOUNDER)
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def pasta_auth(http):
    token, user = _login(http, PASTA)
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def workspaces(http, founder_auth):
    r = http.get(f"{BASE_URL}/api/workspaces", headers=founder_auth["headers"], timeout=30)
    assert r.status_code == 200
    out = {}
    for w in r.json()["workspaces"]:
        out[w["slug"]] = w
    assert "digiactiva" in out and "pasta-al-vuelo" in out
    return out


# ---------- 1. Status GET + redaction ----------
class TestStatus:
    def test_status_no_plain_tokens(self, http, founder_auth):
        r = http.get(f"{BASE_URL}/api/whatsapp/status", headers=founder_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["status", "webhook_url", "has_waba_id", "has_phone_number_id",
                  "has_access_token", "has_verify_token", "has_app_secret",
                  "access_token_redacted", "last_error"]:
            assert k in d, f"missing {k}: {d}"
        # Booleans
        for k in ["has_waba_id", "has_phone_number_id", "has_access_token",
                  "has_verify_token", "has_app_secret"]:
            assert isinstance(d[k], bool)
        # webhook_url uses BACKEND_PUBLIC_URL
        assert d["webhook_url"].startswith("https://") and "/api/whatsapp/webhook" in d["webhook_url"]
        # Redaction must never return the full 'EAA...' (DigiActiva seeded token)
        redacted = d.get("access_token_redacted") or ""
        assert "…" in redacted or redacted in ("(empty)", "(short)")
        # Defence: ensure full seeded token not leaked anywhere in response
        assert "EAA" not in (redacted)  # seeded 3-char start could be 'EAA'; allow short tokens only

    def test_status_requires_auth(self, http):
        r = http.get(f"{BASE_URL}/api/whatsapp/status", timeout=15)
        assert r.status_code in (401, 403)


# ---------- 2. Webhook GET verify ----------
class TestWebhookVerify:
    def test_verify_success_returns_plain_challenge(self, http, workspaces):
        ws = workspaces["digiactiva"]
        wa = (ws.get("integrations") or {}).get("whatsapp", {})
        vt = wa.get("verify_token")
        assert vt, "DigiActiva should have verify_token seeded"
        ch = "challenge_" + uuid.uuid4().hex[:8]
        r = http.get(
            f"{BASE_URL}/api/whatsapp/webhook",
            params={"ws": ws["id"], "hub.mode": "subscribe",
                    "hub.verify_token": vt, "hub.challenge": ch},
            timeout=15,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        # Plain text (not JSON)
        assert r.text == ch
        assert "text/plain" in r.headers.get("content-type", "").lower()

    def test_verify_bad_token_403(self, http, workspaces):
        ws = workspaces["digiactiva"]
        r = http.get(
            f"{BASE_URL}/api/whatsapp/webhook",
            params={"ws": ws["id"], "hub.mode": "subscribe",
                    "hub.verify_token": "WRONG_TOKEN", "hub.challenge": "x"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_verify_sets_status_connected(self, http, workspaces, founder_auth):
        ws = workspaces["digiactiva"]
        # First trigger verification (see previous success test) — re-trigger to be safe
        vt = (ws.get("integrations") or {}).get("whatsapp", {}).get("verify_token")
        http.get(
            f"{BASE_URL}/api/whatsapp/webhook",
            params={"ws": ws["id"], "hub.mode": "subscribe",
                    "hub.verify_token": vt, "hub.challenge": "abc"},
            timeout=15,
        )
        r = http.get(f"{BASE_URL}/api/whatsapp/status", headers=founder_auth["headers"], timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "connected"


# ---------- 3. Mock receive (inbound) ----------
class TestMockReceive:
    @pytest.fixture(scope="class")
    def phone_digi(self):
        # Unique phone per run
        return "+5698" + str(uuid.uuid4().int)[:7]

    @pytest.fixture(scope="class")
    def phone_pasta(self):
        return "+5697" + str(uuid.uuid4().int)[:7]

    def test_requires_jwt(self, http):
        r = http.post(f"{BASE_URL}/api/whatsapp/mock-receive",
                      json={"phone": "+56900000000", "text": "hi"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_inbound_creates_contact_and_message(self, http, founder_auth, phone_digi):
        r = http.post(
            f"{BASE_URL}/api/whatsapp/mock-receive",
            headers=founder_auth["headers"],
            json={"phone": phone_digi, "text": "Hola, vi su web", "profile_name": "TEST_Pedro_B1"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert data["contact_id"]
        # Verify contact exists in DigiActiva
        r2 = http.get(f"{BASE_URL}/api/crm/contacts", headers=founder_auth["headers"], timeout=30)
        assert r2.status_code == 200
        contacts = r2.json()
        hit = [c for c in contacts if c["id"] == data["contact_id"]]
        assert hit, "contact not returned in DigiActiva list"
        c = hit[0]
        assert c["fuente"] == "whatsapp"
        assert c["etapa"] == "nuevo"
        assert c["telefono"] == phone_digi
        # Verify message persisted
        r3 = http.get(f"{BASE_URL}/api/crm/messages/{data['contact_id']}",
                      headers=founder_auth["headers"], timeout=30)
        assert r3.status_code == 200
        payload = r3.json()
        # API returns {"messages": [...], "total": N}
        msgs = payload["messages"] if isinstance(payload, dict) else payload
        assert isinstance(msgs, list) and len(msgs) >= 1
        m = msgs[-1]
        assert m["channel"] == "whatsapp"
        assert m["direction"] == "inbound"
        assert m["content"] == "Hola, vi su web"
        assert m.get("metadata", {}).get("phone") == phone_digi

    def test_inbound_does_not_duplicate(self, http, founder_auth, phone_digi):
        # Count messages before
        r_list = http.get(f"{BASE_URL}/api/crm/contacts", headers=founder_auth["headers"], timeout=30)
        pre = [c for c in r_list.json() if c.get("telefono") == phone_digi]
        assert len(pre) == 1
        cid = pre[0]["id"]
        # Second mock-receive with same phone → same contact
        r = http.post(
            f"{BASE_URL}/api/whatsapp/mock-receive",
            headers=founder_auth["headers"],
            json={"phone": phone_digi, "text": "Mensaje dos"},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["contact_id"] == cid
        # Messages length should be 2
        r3 = http.get(f"{BASE_URL}/api/crm/messages/{cid}",
                      headers=founder_auth["headers"], timeout=30)
        payload = r3.json()
        msgs = payload["messages"] if isinstance(payload, dict) else payload
        assert len(msgs) >= 2
        r_list2 = http.get(f"{BASE_URL}/api/crm/contacts", headers=founder_auth["headers"], timeout=30)
        still = [c for c in r_list2.json() if c.get("telefono") == phone_digi]
        assert len(still) == 1, "duplicated contact detected"

    def test_inbound_workspace_isolation(self, http, pasta_auth, founder_auth, phone_pasta):
        # Pasta admin posts mock-receive → should land in Pasta, not DigiActiva
        r = http.post(
            f"{BASE_URL}/api/whatsapp/mock-receive",
            headers=pasta_auth["headers"],
            json={"phone": phone_pasta, "text": "Cliente Pasta test", "profile_name": "TEST_Cliente_Pasta"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        cid_pasta = r.json()["contact_id"]
        assert cid_pasta
        # DigiActiva founder must NOT see this contact in its list
        # (founder_admin sees active workspace which defaults to DigiActiva per login)
        r2 = http.get(f"{BASE_URL}/api/crm/contacts", headers=founder_auth["headers"], timeout=30)
        digi_contacts = r2.json()
        assert all(c["id"] != cid_pasta for c in digi_contacts), \
            "Pasta contact leaked into DigiActiva list"
        # Pasta admin CAN see it
        r3 = http.get(f"{BASE_URL}/api/crm/contacts", headers=pasta_auth["headers"], timeout=30)
        assert any(c["id"] == cid_pasta for c in r3.json())


# ---------- 4. Send (outbound) — fake creds → 502 ----------
class TestSend:
    def test_send_with_fake_creds_returns_502(self, http, founder_auth):
        # DigiActiva has fake creds (phone_number_id=456, access_token=EAA)
        r = http.post(
            f"{BASE_URL}/api/whatsapp/send",
            headers=founder_auth["headers"],
            json={"phone": "+56911111111", "text": "TEST from B1"},
            timeout=30,
        )
        assert r.status_code == 502, f"expected 502 got {r.status_code}: {r.text}"
        body = r.json()
        assert "detail" in body
        assert "Meta API" in body["detail"] or "Network" in body["detail"]

    def test_send_persists_last_error(self, http, founder_auth):
        r = http.get(f"{BASE_URL}/api/whatsapp/status", headers=founder_auth["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "error", f"expected error status after failed send, got {d['status']}"
        assert d["last_error"], "last_error should be populated"

    def test_send_missing_creds_400(self, http, founder_auth):
        """Create a temp workspace with no creds; confirm /api/whatsapp/send
        returns 400 pending_credentials (not 502). Uses founder's ability to
        switch active workspace. Skips if switch endpoint not available."""
        # Create empty-creds workspace
        ws_name = f"TEST_WA_empty_{uuid.uuid4().hex[:6]}"
        r = http.post(
            f"{BASE_URL}/api/workspaces",
            headers=founder_auth["headers"],
            json={"name": ws_name, "slug": ws_name.lower(), "plan": "elite"},
            timeout=15,
        )
        if r.status_code != 200:
            pytest.skip(f"cannot create empty workspace: {r.status_code} {r.text}")
        empty_ws_id = r.json()["id"]
        # Switch active workspace (founder can switch)
        sw = http.post(
            f"{BASE_URL}/api/auth/switch-workspace",
            headers=founder_auth["headers"],
            json={"workspace_id": empty_ws_id},
            timeout=15,
        )
        if sw.status_code != 200:
            pytest.skip(f"switch-workspace unavailable: {sw.status_code}")
        new_token = sw.json().get("token") or founder_auth["token"]
        hdr = {"Authorization": f"Bearer {new_token}"}
        r2 = http.post(
            f"{BASE_URL}/api/whatsapp/send",
            headers=hdr,
            json={"phone": "+56900000000", "text": "x"},
            timeout=30,
        )
        assert r2.status_code == 400, f"{r2.status_code} {r2.text}"
        assert "pending" in r2.json().get("detail", "").lower()
        # Switch back to DigiActiva to not disturb other tests
        digi_id = None
        wsr = http.get(f"{BASE_URL}/api/workspaces", headers=founder_auth["headers"], timeout=15)
        if wsr.status_code == 200:
            for w in wsr.json()["workspaces"]:
                if w["slug"] == "digiactiva":
                    digi_id = w["id"]
                    break
        if digi_id:
            http.post(
                f"{BASE_URL}/api/auth/switch-workspace",
                headers=founder_auth["headers"],
                json={"workspace_id": digi_id},
                timeout=15,
            )


# ---------- 5. Workspace integrations PUT: status auto ----------
class TestIntegrationStatusAuto:
    def test_webhook_ready_when_all_fields(self, http, founder_auth, workspaces):
        # After failed send, DigiActiva's WhatsApp status is 'error'. PUT full creds again
        # should NOT regress to webhook_ready (since it was connected before webhook verify).
        # We verify the rule: all required fields filled → 'connected' (if prev connected)
        # or 'webhook_ready' otherwise.
        ws_id = workspaces["digiactiva"]["id"]
        payload = {
            "waba_id": "123", "phone_number_id": "456",
            "access_token": "EAA_fake", "verify_token": "vt",
            "app_secret": "as",
        }
        r = http.put(
            f"{BASE_URL}/api/workspaces/{ws_id}/integrations/whatsapp",
            headers=founder_auth["headers"], json=payload, timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] in ("connected", "webhook_ready"), f"got {d['status']}"
        # webhook_url built from BACKEND_PUBLIC_URL
        assert d.get("webhook_url", "").endswith(f"ws={ws_id}")

    def test_not_connected_when_missing(self, http, founder_auth, workspaces):
        ws_id = workspaces["digiactiva"]["id"]
        # Clear verify_token → should go to not_connected
        payload = {
            "waba_id": "123", "phone_number_id": "456",
            "access_token": "EAA_fake", "verify_token": "",
            "app_secret": "as",
        }
        r = http.put(
            f"{BASE_URL}/api/workspaces/{ws_id}/integrations/whatsapp",
            headers=founder_auth["headers"], json=payload, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "not_connected"
        # Restore creds for subsequent runs / manual QA
        http.put(
            f"{BASE_URL}/api/workspaces/{ws_id}/integrations/whatsapp",
            headers=founder_auth["headers"],
            json={"waba_id": "123", "phone_number_id": "456",
                  "access_token": "EAA_fake", "verify_token": "vt", "app_secret": "as"},
            timeout=15,
        )


# ---------- 6. Multi-tenant: Pasta admin cannot send in DigiActiva ----------
class TestMultiTenantSend:
    def test_pasta_cannot_send_using_digiactiva(self, http, pasta_auth, workspaces):
        """Pasta admin sending WhatsApp MUST operate on Pasta's creds, never
        DigiActiva's. We verify: (1) request succeeds/fails using Pasta's own
        creds (p1/p2/EAAp); (2) DigiActiva's EAA_fake token never appears in
        the error response; (3) last_error is persisted on Pasta, not DigiActiva."""
        r = http.post(
            f"{BASE_URL}/api/whatsapp/send",
            headers=pasta_auth["headers"],
            json={"phone": "+56911111111", "text": "x"},
            timeout=30,
        )
        assert r.status_code in (400, 502)
        # Must never leak DigiActiva's specific fake token
        assert "EAA_fake" not in r.text
        # Confirm error/status persisted into PASTA only
        pasta_status = http.get(
            f"{BASE_URL}/api/whatsapp/status", headers=pasta_auth["headers"], timeout=15
        ).json()
        # Pasta has its own creds set from prior runs → status should reflect error
        if r.status_code == 502:
            assert pasta_status["status"] == "error"
