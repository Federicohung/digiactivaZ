"""
DIGIACTIVA - Chat agent + Agent config + Chat sessions tests.
Covers: public chat, lead auto-capture, agent config CRUD, sessions listing.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- Public endpoints ----
class TestChatGreeting:
    def test_greeting_returns_text(self, session):
        r = session.get(f"{API}/chat/greeting", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "greeting" in data
        assert isinstance(data["greeting"], str) and len(data["greeting"]) > 5


class TestChatPublicMessage:
    def test_first_message_creates_session(self, session):
        sid = f"test-sess-{uuid.uuid4()}"
        r = session.post(
            f"{API}/chat/message",
            json={"session_id": sid, "message": "Hola, tengo una peluquería"},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["session_id"] == sid
        assert isinstance(data["message"], str) and len(data["message"]) > 5
        assert data["lead_captured"] == False
        assert data.get("contact_id") in (None, "")

    def test_lead_captured_with_email_and_phone(self, session):
        sid = f"test-lead-{uuid.uuid4()}"
        unique = int(time.time())
        email = f"test_chat_{unique}@example.com"
        phone = f"+5699{unique % 10000000:07d}"

        # msg 1 (visitor)
        r1 = session.post(
            f"{API}/chat/message",
            json={"session_id": sid, "message": "Hola, tengo un restaurante en Santiago"},
            timeout=90,
        )
        assert r1.status_code == 200, r1.text

        # msg 2 (visitor provides name + email + phone - triggers extraction)
        r2 = session.post(
            f"{API}/chat/message",
            json={
                "session_id": sid,
                "message": f"Soy Pedro Soto, mi email es {email} y mi teléfono es {phone}, quiero Plan Gestión",
            },
            timeout=120,
        )
        assert r2.status_code == 200, r2.text
        data2 = r2.json()
        # After 2 visitor messages, extraction is triggered
        assert data2["lead_captured"] == True, f"expected lead_captured=true, got: {data2}"
        assert data2["contact_id"], "contact_id must be populated after capture"
        contact_id = data2["contact_id"]

        # Verify contact exists in CRM with fuente=landing_chat
        c = session.get(f"{API}/crm/contacts/{contact_id}", timeout=20)
        assert c.status_code == 200, c.text
        cj = c.json()
        assert cj["fuente"] == "landing_chat"
        assert "_id" not in cj
        # email should match (lower-cased)
        assert (cj.get("email") or "").lower() == email.lower()

        # Also appears when filtering by fuente
        listed = session.get(f"{API}/crm/contacts", params={"fuente": "landing_chat"}, timeout=20)
        assert listed.status_code == 200
        assert any(x.get("id") == contact_id for x in listed.json())

        # Timeline has 'creado' event with source=landing_chat
        tl = session.get(f"{API}/crm/timeline/{contact_id}", timeout=20).json()
        assert any(
            e["tipo"] == "creado" and (e.get("metadata") or {}).get("source") == "landing_chat"
            for e in tl
        ), f"expected creado event with source=landing_chat, got {tl}"

        # No duplicate: new session with same email -> same contact (update path)
        sid2 = f"test-dup-{uuid.uuid4()}"
        session.post(
            f"{API}/chat/message",
            json={"session_id": sid2, "message": "Hola de nuevo"},
            timeout=90,
        )
        r3 = session.post(
            f"{API}/chat/message",
            json={
                "session_id": sid2,
                "message": f"Soy Pedro Soto otra vez, escríbeme a {email}",
            },
            timeout=120,
        )
        assert r3.status_code == 200
        # If lead_captured triggered, contact_id should equal the existing one
        d3 = r3.json()
        if d3.get("lead_captured"):
            assert d3["contact_id"] == contact_id, "Must update existing contact, not duplicate"

        # Cleanup
        session.delete(f"{API}/crm/contacts/{contact_id}", timeout=20)


class TestChatSessionPersistence:
    def test_session_stores_messages_and_ai_log(self, session):
        sid = f"test-persist-{uuid.uuid4()}"
        r = session.post(
            f"{API}/chat/message",
            json={"session_id": sid, "message": "Hola, info por favor"},
            timeout=90,
        )
        assert r.status_code == 200

        # Admin: get session by id
        g = session.get(f"{API}/crm/chat-sessions/{sid}", timeout=20)
        assert g.status_code == 200
        sess = g.json()
        assert "_id" not in sess
        assert len(sess["messages"]) >= 2  # user + assistant
        roles = [m["role"] for m in sess["messages"]]
        assert "user" in roles and "assistant" in roles

        # AI logs endpoint should include tipo='chat' entries
        logs = session.get(f"{API}/crm/ai/logs", params={"limit": 50}, timeout=20).json()
        assert any(l.get("tipo") == "chat" for l in logs["logs"]), "expected tipo=chat log"


# ---- Admin: Agent config ----
class TestAgentConfig:
    def test_get_agent_config_has_all_fields(self, session):
        r = session.get(f"{API}/crm/agent-config", timeout=20)
        assert r.status_code == 200
        cfg = r.json()
        for k in [
            "personalidad", "tono", "objeciones", "planes_vigentes",
            "promociones", "nichos_prioritarios", "preguntas_calificacion",
            "cta_final", "saludo_inicial"
        ]:
            assert k in cfg, f"missing field {k}"
        assert "_id" not in cfg
        assert isinstance(cfg["objeciones"], list)
        assert isinstance(cfg["nichos_prioritarios"], list)
        assert isinstance(cfg["preguntas_calificacion"], list)

    def test_put_agent_config_updates(self, session):
        original = session.get(f"{API}/crm/agent-config", timeout=20).json()
        new_saludo = f"Hola prueba {uuid.uuid4().hex[:6]} 👋"
        payload = {**{k: v for k, v in original.items() if k not in ("_id",)},
                   "saludo_inicial": new_saludo}
        r = session.put(f"{API}/crm/agent-config", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        # Verify /chat/greeting now reflects update
        g = session.get(f"{API}/chat/greeting", timeout=20).json()
        assert g["greeting"] == new_saludo
        # Also fetching config returns new saludo
        cur = session.get(f"{API}/crm/agent-config", timeout=20).json()
        assert cur["saludo_inicial"] == new_saludo

    def test_reset_agent_config(self, session):
        r = session.post(f"{API}/crm/agent-config/reset", timeout=20)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["saludo_inicial"].startswith("Hola")
        assert "_id" not in cfg


# ---- Admin: Chat sessions listing ----
class TestChatSessionsList:
    def test_list_sessions_structure(self, session):
        r = session.get(f"{API}/crm/chat-sessions", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "sessions" in data and "total" in data
        for s in data["sessions"]:
            assert "_id" not in s
            for k in ["id", "contact_id", "lead_data", "messages_count",
                      "last_message_preview", "created_at", "updated_at"]:
                assert k in s, f"missing key {k} in session summary"

    def test_session_404(self, session):
        r = session.get(f"{API}/crm/chat-sessions/does-not-exist-xyz", timeout=20)
        assert r.status_code == 404
