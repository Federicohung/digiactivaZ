"""
Sprint B0 - Web Chat → CRM messaging tests.
Covers:
- Source renamed landing_chat → web_chat (migration + new captures).
- Unified crm_messages collection + GET /api/crm/messages/{contact_id}.
- messaging.record_message validation (channel, direction).
- messaging.upsert_contact_from_signal behavior (None if no identifiers).
- Workspace isolation for messages.
- Chat capture lead_data (score, proxima_accion, fuente).
- Workspace param routing (?workspace=pasta-al-vuelo).
- crm_messages indexes.
- No Mongo _id leakage.
"""
import os
import time
import uuid
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

FOUNDER = {"email": "founder@digiactiva.com", "password": "digiactiva2025"}
PASTA = {"email": "admin@pastaalvuelo.com", "password": "pastaalvuelo2025"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(http, creds):
    r = http.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="session")
def founder_token(http):
    return _login(http, FOUNDER)


@pytest.fixture(scope="session")
def pasta_token(http):
    return _login(http, PASTA)


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- MESSAGING MODULE unit-ish tests via public API ----------
class TestMessagingValidation:
    """record_message + upsert_contact_from_signal validation reachable via chat."""

    def test_invalid_channel_raises(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from messaging import record_message  # noqa

        async def run():
            class FakeDB:
                class crm_messages:
                    @staticmethod
                    async def insert_one(doc):
                        return None
            with pytest.raises(ValueError):
                await record_message(FakeDB, "ws", channel="telegram",
                                     direction="inbound", content="x")
            with pytest.raises(ValueError):
                await record_message(FakeDB, "ws", channel="web_chat",
                                     direction="oops", content="x")
        asyncio.run(run())

    def test_upsert_returns_none_without_identifiers(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from messaging import upsert_contact_from_signal  # noqa

        async def run():
            class FakeDB: pass
            cid = await upsert_contact_from_signal(
                FakeDB, "ws", phone=None, email=None, name="NoId"
            )
            assert cid is None
        asyncio.run(run())


# ---------- WORKSPACE PARAM (public) ----------
class TestWorkspaceParam:
    def test_greeting_default_is_digiactiva(self, http):
        r = http.get(f"{API}/chat/greeting", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("workspace") == "digiactiva"

    def test_greeting_pasta_slug(self, http):
        r = http.get(f"{API}/chat/greeting", params={"workspace": "pasta-al-vuelo"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("workspace") == "pasta-al-vuelo"
        # Pasta greeting should be different from DigiActiva
        da = http.get(f"{API}/chat/greeting", timeout=20).json()
        assert data["greeting"] != da["greeting"] or data["workspace_name"] != da["workspace_name"]

    def test_greeting_unknown_workspace_404(self, http):
        r = http.get(f"{API}/chat/greeting", params={"workspace": "ghost-ws-xyz"}, timeout=20)
        assert r.status_code == 404


# ---------- CHAT captures with web_chat source ----------
class TestChatSourceWebChat:
    @pytest.fixture(scope="class")
    def captured(self, http):
        """Drive a 2-visitor-message chat to trigger lead capture in DigiActiva."""
        sid = f"b0-{uuid.uuid4()}"
        unique = int(time.time())
        email = f"b0_test_{unique}@example.com"
        phone = f"+5699{unique % 10000000:07d}"

        r1 = http.post(f"{API}/chat/message", json={
            "session_id": sid,
            "message": "Hola! Tengo una cafetería en Santiago y quiero más clientes."
        }, timeout=120)
        assert r1.status_code == 200, r1.text

        r2 = http.post(f"{API}/chat/message", json={
            "session_id": sid,
            "message": (f"Me llamo Ana Torres, mi email es {email}, teléfono {phone}. "
                        f"Mi negocio se llama Cafe Aroma, rubro café. Quiero el plan premium.")
        }, timeout=180)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        return {
            "sid": sid,
            "email": email,
            "phone": phone,
            "response": data,
        }

    def test_lead_captured_with_web_chat_source(self, http, founder_token, captured):
        data = captured["response"]
        assert data.get("lead_captured") == True, f"Expected lead captured, got {data}"
        contact_id = data.get("contact_id")
        assert contact_id

        # Verify contact fuente=web_chat via authenticated GET
        r = http.get(f"{API}/crm/contacts/{contact_id}", headers=_auth(founder_token), timeout=20)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["fuente"] == "web_chat", f"Expected web_chat, got {c.get('fuente')}"
        assert "_id" not in c

    def test_contact_has_score_and_proxima_accion(self, http, founder_token, captured):
        contact_id = captured["response"]["contact_id"]
        r = http.get(f"{API}/crm/contacts/{contact_id}", headers=_auth(founder_token), timeout=20)
        c = r.json()
        # score 0-100, should be >0 because visitor shown interest
        assert isinstance(c.get("score_ia"), int)
        assert 0 <= c["score_ia"] <= 100
        # proxima_accion populated by IA
        assert c.get("proxima_accion"), f"proxima_accion should be populated, got {c}"

    def test_messages_stored_in_crm_messages(self, http, founder_token, captured):
        contact_id = captured["response"]["contact_id"]
        r = http.get(f"{API}/crm/messages/{contact_id}",
                     headers=_auth(founder_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "messages" in data and "total" in data
        msgs = data["messages"]
        # At least 4 messages (2 inbound + 2 outbound) after backfill
        assert data["total"] >= 4, f"Expected >=4 messages after backfill, got {data['total']}"
        # All are web_chat
        assert all(m["channel"] == "web_chat" for m in msgs)
        # Both directions present
        dirs = {m["direction"] for m in msgs}
        assert "inbound" in dirs and "outbound" in dirs
        # Schema check
        for m in msgs:
            for k in ("id", "workspace_id", "channel", "direction", "content",
                      "contact_id", "session_id", "metadata", "created_at"):
                assert k in m, f"missing {k} in message"
            assert "_id" not in m
            assert m["contact_id"] == contact_id
        # Ordered by created_at asc
        times = [m["created_at"] for m in msgs]
        assert times == sorted(times), "messages must be sorted ascending"

    def test_messages_require_jwt(self, http, captured):
        contact_id = captured["response"]["contact_id"]
        r = http.get(f"{API}/crm/messages/{contact_id}", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ---------- WORKSPACE ISOLATION ----------
class TestWorkspaceIsolation:
    def test_pasta_cannot_see_digiactiva_messages(self, http, founder_token, pasta_token):
        """Capture a lead in DigiActiva then verify Pasta admin cannot read its messages."""
        sid = f"b0-iso-{uuid.uuid4()}"
        unique = int(time.time()) + 1
        email = f"b0_iso_{unique}@example.com"
        phone = f"+5699{unique % 10000000:07d}"
        http.post(f"{API}/chat/message", json={
            "session_id": sid, "message": "Hola, gimnasio en Ñuñoa."
        }, timeout=120)
        r2 = http.post(f"{API}/chat/message", json={
            "session_id": sid,
            "message": f"Soy Luis, email {email}, tel {phone}, negocio Gym Pro."
        }, timeout=180)
        assert r2.status_code == 200
        d = r2.json()
        if not d.get("lead_captured"):
            pytest.skip("Lead not captured by LLM this run")
        contact_id = d["contact_id"]

        # Founder can see
        rf = http.get(f"{API}/crm/messages/{contact_id}",
                      headers=_auth(founder_token), timeout=20)
        assert rf.status_code == 200 and rf.json()["total"] >= 2

        # Pasta admin on pasta workspace should get empty list (contact doesn't belong to pasta)
        rp = http.get(f"{API}/crm/messages/{contact_id}",
                      headers=_auth(pasta_token), timeout=20)
        assert rp.status_code == 200
        assert rp.json()["total"] == 0, "Pasta must not see DigiActiva messages"

    def test_chat_with_pasta_workspace_param(self, http, pasta_token, founder_token):
        """POST /api/chat/message body.workspace=pasta-al-vuelo → contact in Pasta."""
        sid = f"b0-pasta-{uuid.uuid4()}"
        unique = int(time.time()) + 2
        email = f"b0_pasta_{unique}@example.com"
        phone = f"+5699{unique % 10000000:07d}"
        http.post(f"{API}/chat/message", json={
            "session_id": sid, "workspace": "pasta-al-vuelo",
            "message": "Hola, quiero hacer pedido de pasta para 4."
        }, timeout=120)
        r2 = http.post(f"{API}/chat/message", json={
            "session_id": sid, "workspace": "pasta-al-vuelo",
            "message": f"Soy Carla Muñoz, email {email}, tel {phone}. Quiero plato del día."
        }, timeout=180)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d.get("workspace") == "pasta-al-vuelo"
        if not d.get("lead_captured"):
            pytest.skip("Lead not captured by LLM this run")
        contact_id = d["contact_id"]

        # Pasta admin should find this contact
        rp = http.get(f"{API}/crm/contacts/{contact_id}",
                      headers=_auth(pasta_token), timeout=20)
        assert rp.status_code == 200, rp.text
        c = rp.json()
        assert c["fuente"] == "web_chat"

        # DigiActiva founder must NOT see it through Pasta isolation if switched to Pasta
        # (founder_admin can access both; test that under pasta workspace the contact is visible)
        # Also: listing contacts as Pasta admin should include it
        lst = http.get(f"{API}/crm/contacts", headers=_auth(pasta_token), timeout=20)
        assert lst.status_code == 200
        ids = [x["id"] for x in lst.json()]
        assert contact_id in ids


# ---------- MIGRATION ----------
class TestMigration:
    def test_no_landing_chat_contacts_remain(self, http, founder_token):
        """After startup migration, no contact should retain fuente=landing_chat."""
        r = http.get(f"{API}/crm/contacts", headers=_auth(founder_token),
                     params={"fuente": "landing_chat"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 0, f"Expected 0 landing_chat contacts, found {len(data)}"


# ---------- DB indexes + CRM Literal source ----------
class TestBackendDB:
    def test_crm_messages_indexes(self):
        """Directly check indexes exist."""
        import sys
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        import os as _os
        from dotenv import load_dotenv as _ld
        _ld("/app/backend/.env")

        async def run():
            cli = AsyncIOMotorClient(_os.environ["MONGO_URL"])
            db = cli[_os.environ["DB_NAME"]]
            info = await db.crm_messages.index_information()
            keys = []
            for _, v in info.items():
                keys.append([k[0] for k in v["key"]])
            has_compound = any(
                "workspace_id" in k and "contact_id" in k and "created_at" in k for k in keys
            )
            has_session = any(k == ["session_id"] for k in keys)
            assert has_compound, f"missing compound index, got {keys}"
            assert has_session, f"missing session_id index, got {keys}"
        asyncio.run(run())

    def test_crm_literal_accepts_web_chat(self, http, founder_token):
        """POST contact with fuente=web_chat should not 422."""
        payload = {
            "nombre": "TEST_B0_Source",
            "empresa": "TEST_B0",
            "telefono": "+56911112222",
            "email": f"test_b0_{uuid.uuid4().hex[:6]}@example.com",
            "fuente": "web_chat",
            "etapa": "nuevo",
        }
        r = http.post(f"{API}/crm/contacts", json=payload,
                      headers=_auth(founder_token), timeout=20)
        assert r.status_code in (200, 201), r.text
        cid = r.json()["id"]
        # Cleanup
        http.delete(f"{API}/crm/contacts/{cid}", headers=_auth(founder_token), timeout=20)
