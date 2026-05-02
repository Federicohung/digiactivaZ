"""
ACTIVA FOUNDER OS - CRM Backend Test Suite
Tests all CRM endpoints + admin login + AI Copilot integration with GPT-4o.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://digiactiva-chile.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = os.environ.get('TEST_ADMIN_PASSWORD', 'digiactiva2025')


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
    return data["token"]


@pytest.fixture(scope="session")
def created_contact_id(session):
    """Create a persistent contact used by AI tests and cleaned at session end."""
    payload = {
        "empresa": "TEST_Empresa QA",
        "nombre": "TEST Juan Perez",
        "telefono": "+56912345678",
        "email": "test_qa@example.com",
        "nicho": "Restaurantes",
        "fuente": "whatsapp",
        "valor_mensual": 250000,
        "setup_fee": 150000,
        "notas": "Lead creado por testing agent"
    }
    r = session.post(f"{API}/crm/contacts", json=payload, timeout=20)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    cid = r.json()["id"]
    yield cid
    # cleanup
    session.delete(f"{API}/crm/contacts/{cid}", timeout=20)


# ---- ADMIN LOGIN ----
class TestAdminLogin:
    def test_login_success(self, session):
        r = session.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert "expires_at" in data

    def test_login_wrong_password(self, session):
        r = session.post(f"{API}/admin/login", json={"password": "wrong"}, timeout=20)
        assert r.status_code == 401


# ---- METRICS ----
class TestMetrics:
    def test_metrics_structure(self, session):
        r = session.get(f"{API}/crm/metrics", timeout=20)
        assert r.status_code == 200
        data = r.json()
        for k in ["prospectos_activos", "revenue_potencial", "mrr_actual", "alertas", "por_etapa"]:
            assert k in data, f"missing key {k}"
        for stage in ["nuevo", "trabajando", "propuesta", "cierre", "ganado", "perdido"]:
            assert stage in data["por_etapa"]


# ---- PIPELINE ----
class TestPipeline:
    def test_pipeline_groups(self, session):
        r = session.get(f"{API}/crm/pipeline", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "pipeline" in data
        assert "totals" in data
        for stage in ["nuevo", "trabajando", "propuesta", "cierre", "ganado", "perdido"]:
            assert stage in data["pipeline"]
            assert isinstance(data["pipeline"][stage], list)
            assert stage in data["totals"]
            assert "count" in data["totals"][stage]
            assert "value" in data["totals"][stage]
            for c in data["pipeline"][stage]:
                assert "_id" not in c, "Mongo _id must not be leaked"

    def test_pipeline_move(self, session, created_contact_id):
        r = session.put(f"{API}/crm/pipeline/move/{created_contact_id}",
                        params={"new_stage": "trabajando"}, timeout=20)
        assert r.status_code == 200
        # verify
        g = session.get(f"{API}/crm/contacts/{created_contact_id}", timeout=20).json()
        assert g["etapa"] == "trabajando"
        # Timeline event created
        tl = session.get(f"{API}/crm/timeline/{created_contact_id}", timeout=20).json()
        assert any(e["tipo"] == "etapa" for e in tl)

    def test_pipeline_move_invalid_stage(self, session, created_contact_id):
        r = session.put(f"{API}/crm/pipeline/move/{created_contact_id}",
                        params={"new_stage": "invalid_stage"}, timeout=20)
        assert r.status_code == 400


# ---- CONTACTS CRUD ----
class TestContacts:
    def test_create_and_timeline_event(self, session):
        payload = {
            "empresa": "TEST_CreateCo",
            "nombre": "TEST Creator",
            "telefono": "+56900000001",
            "email": "tcreate@ex.com",
            "fuente": "instagram",
            "valor_mensual": 100000
        }
        r = session.post(f"{API}/crm/contacts", json=payload, timeout=20)
        assert r.status_code == 200
        c = r.json()
        assert c["empresa"] == payload["empresa"]
        assert c["etapa"] == "nuevo"
        assert "_id" not in c
        cid = c["id"]
        # Timeline 'creado' event
        tl = session.get(f"{API}/crm/timeline/{cid}", timeout=20).json()
        assert any(e["tipo"] == "creado" for e in tl)
        # Cleanup
        session.delete(f"{API}/crm/contacts/{cid}", timeout=20)

    def test_get_contact_by_id(self, session, created_contact_id):
        r = session.get(f"{API}/crm/contacts/{created_contact_id}", timeout=20)
        assert r.status_code == 200
        assert "_id" not in r.json()

    def test_get_contact_404(self, session):
        r = session.get(f"{API}/crm/contacts/nonexistent-id-xyz", timeout=20)
        assert r.status_code == 404

    def test_filters(self, session):
        r = session.get(f"{API}/crm/contacts", params={"etapa": "nuevo"}, timeout=20)
        assert r.status_code == 200
        for c in r.json():
            assert c["etapa"] == "nuevo"
            assert "_id" not in c

        r = session.get(f"{API}/crm/contacts", params={"search": "TEST"}, timeout=20)
        assert r.status_code == 200

        r = session.get(f"{API}/crm/contacts", params={"fuente": "whatsapp"}, timeout=20)
        assert r.status_code == 200

        r = session.get(f"{API}/crm/contacts", params={"calientes": "true"}, timeout=20)
        assert r.status_code == 200

        r = session.get(f"{API}/crm/contacts", params={"sin_seguimiento": "true"}, timeout=20)
        assert r.status_code == 200

    def test_update_contact_stage_change(self, session, created_contact_id):
        r = session.put(f"{API}/crm/contacts/{created_contact_id}",
                        json={"etapa": "propuesta", "probabilidad_cierre": 70}, timeout=20)
        assert r.status_code == 200
        assert r.json()["etapa"] == "propuesta"
        # Verify persistence
        g = session.get(f"{API}/crm/contacts/{created_contact_id}", timeout=20).json()
        assert g["etapa"] == "propuesta"
        assert g["probabilidad_cierre"] == 70

    def test_delete_contact(self, session):
        payload = {"empresa": "TEST_DelCo", "nombre": "Del", "telefono": "+56900000002"}
        cid = session.post(f"{API}/crm/contacts", json=payload, timeout=20).json()["id"]
        r = session.delete(f"{API}/crm/contacts/{cid}", timeout=20)
        assert r.status_code == 200
        r2 = session.get(f"{API}/crm/contacts/{cid}", timeout=20)
        assert r2.status_code == 404


# ---- TIMELINE ----
class TestTimeline:
    def test_add_event_updates_ultimo_contacto(self, session, created_contact_id):
        r = session.post(f"{API}/crm/timeline",
                         json={"contact_id": created_contact_id, "tipo": "llamada",
                               "descripcion": "Llamada de prueba"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["tipo"] == "llamada"
        # Verify ultimo_contacto updated
        c = session.get(f"{API}/crm/contacts/{created_contact_id}", timeout=20).json()
        assert c.get("ultimo_contacto") is not None

    def test_timeline_sorted_desc(self, session, created_contact_id):
        r = session.get(f"{API}/crm/timeline/{created_contact_id}", timeout=20)
        assert r.status_code == 200
        events = r.json()
        times = [e["created_at"] for e in events]
        assert times == sorted(times, reverse=True)


# ---- SETTINGS ----
class TestSettings:
    def test_get_settings_creates_default(self, session):
        r = session.get(f"{API}/crm/settings", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "meta_mensual" in d
        assert "_id" not in d

    def test_update_meta_mensual(self, session):
        r = session.put(f"{API}/crm/settings", json={"meta_mensual": 5000000}, timeout=20)
        assert r.status_code == 200
        g = session.get(f"{API}/crm/settings", timeout=20).json()
        assert g["meta_mensual"] == 5000000


# ---- AI COPILOT (GPT-4o real) ----
class TestAI:
    def test_ai_whatsapp(self, session, created_contact_id):
        r = session.post(f"{API}/crm/ai/generate",
                         json={"contact_id": created_contact_id, "tipo": "whatsapp"}, timeout=90)
        assert r.status_code == 200, f"AI whatsapp failed: {r.text}"
        data = r.json()
        assert data["tipo"] == "whatsapp"
        assert isinstance(data["contenido"], str) and len(data["contenido"]) > 20

    def test_ai_email(self, session, created_contact_id):
        r = session.post(f"{API}/crm/ai/generate",
                         json={"contact_id": created_contact_id, "tipo": "email"}, timeout=90)
        assert r.status_code == 200
        assert len(r.json()["contenido"]) > 30

    def test_ai_followup(self, session, created_contact_id):
        r = session.post(f"{API}/crm/ai/generate",
                         json={"contact_id": created_contact_id, "tipo": "followup"}, timeout=90)
        assert r.status_code == 200
        assert len(r.json()["contenido"]) > 20

    def test_ai_score(self, session, created_contact_id):
        r = session.post(f"{API}/crm/ai/generate",
                         json={"contact_id": created_contact_id, "tipo": "score"}, timeout=90)
        assert r.status_code == 200
        assert len(r.json()["contenido"]) > 10

    def test_ai_priorities(self, session):
        r = session.get(f"{API}/crm/ai/priorities", timeout=90)
        assert r.status_code == 200
        data = r.json()
        assert "prioridades" in data or "mensaje" in data
        # hot_leads returned when leads exist
        if "hot_leads" in data:
            for l in data["hot_leads"]:
                assert "_id" not in l


# ---- NEW: Auto-mirror public lead -> CRM ----
class TestPublicLeadMirror:
    def test_public_lead_creates_crm_contact(self, session):
        unique_email = f"test_mirror_{int(time.time())}@example.com"
        payload = {
            "nombre": "TEST_Mirror Lead",
            "email": unique_email,
            "telefono": "+56987654321",
            "mensaje": "Quiero info de prueba",
            "servicio_interes": "gestion",
        }
        r = session.post(f"{API}/leads", json=payload, timeout=20)
        assert r.status_code == 200, f"public lead creation failed: {r.text}"
        # Now find in CRM contacts
        time.sleep(0.5)
        cs = session.get(f"{API}/crm/contacts", params={"fuente": "formulario"}, timeout=20).json()
        match = [c for c in cs if c.get("email") == unique_email]
        assert match, f"Lead not mirrored into CRM. Found {len(cs)} formulario contacts"
        c = match[0]
        assert c["fuente"] == "formulario"
        assert c["etapa"] == "nuevo"
        assert "_id" not in c
        # Cleanup
        session.delete(f"{API}/crm/contacts/{c['id']}", timeout=20)


# ---- NEW: AI tokens field + AI logs endpoint ----
class TestAILogs:
    def test_ai_generate_returns_tokens(self, session, created_contact_id):
        r = session.post(f"{API}/crm/ai/generate",
                         json={"contact_id": created_contact_id, "tipo": "whatsapp"}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "tokens" in data, "response missing 'tokens' field"
        assert isinstance(data["tokens"], int) and data["tokens"] > 0

    def test_ai_logs_structure(self, session):
        r = session.get(f"{API}/crm/ai/logs", params={"limit": 20}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "logs" in data and isinstance(data["logs"], list)
        assert "stats" in data
        stats = data["stats"]
        for k in ["total_calls", "total_tokens", "estimated_cost_usd", "model"]:
            assert k in stats, f"missing stats key {k}"
        assert stats["model"] == "gpt-4o-mini"
        assert stats["total_calls"] > 0  # we just generated above
        for log in data["logs"]:
            assert "_id" not in log

    def test_ai_generate_creates_timeline_ia_event(self, session, created_contact_id):
        # Trigger an AI call
        r = session.post(f"{API}/crm/ai/generate",
                         json={"contact_id": created_contact_id, "tipo": "followup"}, timeout=90)
        assert r.status_code == 200
        # Timeline should contain a tipo="ia" event
        tl = session.get(f"{API}/crm/timeline/{created_contact_id}", timeout=20).json()
        assert any(e["tipo"] == "ia" for e in tl), "Expected timeline event tipo='ia' after AI generation"

    def test_ai_priorities_logged(self, session):
        # Take baseline
        before = session.get(f"{API}/crm/ai/logs", params={"limit": 1}, timeout=20).json()["stats"]["total_calls"]
        r = session.get(f"{API}/crm/ai/priorities", timeout=90)
        assert r.status_code == 200
        after = session.get(f"{API}/crm/ai/logs", params={"limit": 5}, timeout=20).json()
        # Must have at least one log of tipo=prioridades after the call
        types = [l.get("tipo") for l in after["logs"]]
        assert "prioridades" in types, f"prioridades log missing. Got types: {types}"
        assert after["stats"]["total_calls"] >= before


# ---- NEW: Metrics extended fields ----
class TestMetricsExtended:
    def test_metrics_has_new_fields(self, session):
        r = session.get(f"{API}/crm/metrics", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "tasa_conversion" in d, "tasa_conversion missing"
        assert isinstance(d["tasa_conversion"], (int, float))
        assert "actividad_hoy" in d
        for k in ["leads_nuevos", "eventos", "ai_calls"]:
            assert k in d["actividad_hoy"], f"actividad_hoy.{k} missing"
            assert isinstance(d["actividad_hoy"][k], int)


# ---- NEW: Timeline accepts ia event without validation error ----
class TestTimelineIaType:
    def test_timeline_returns_ia_events(self, session, created_contact_id):
        # Make sure AI generation happened in this session
        session.post(f"{API}/crm/ai/generate",
                     json={"contact_id": created_contact_id, "tipo": "email"}, timeout=90)
        r = session.get(f"{API}/crm/timeline/{created_contact_id}", timeout=20)
        assert r.status_code == 200, f"timeline returned {r.status_code}: {r.text}"
        events = r.json()
        # Pydantic validation must accept tipo='ia'
        assert any(e["tipo"] == "ia" for e in events)
