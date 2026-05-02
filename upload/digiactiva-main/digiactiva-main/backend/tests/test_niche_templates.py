"""Backend tests for niche templates and apply-template endpoints."""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://digiactiva-chile.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

FOUNDER = {"email": "founder@digiactiva.com", "password": "digiactiva2025"}
PASTA = {"email": "admin@pastaalvuelo.com", "password": "pastaalvuelo2025"}
EXPECTED_TEMPLATES = {"clinica_estetica","restaurante","abogado_extranjeria","inmobiliaria","hotel","taller_mecanico"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def founder_headers():
    return {"Authorization": f"Bearer {_login(FOUNDER)}"}

@pytest.fixture(scope="module")
def pasta_headers():
    return {"Authorization": f"Bearer {_login(PASTA)}"}


def _get_workspace(headers, slug):
    r = requests.get(f"{API}/workspaces", headers=headers, timeout=20)
    assert r.status_code == 200
    for w in r.json().get("workspaces", []):
        if w["slug"] == slug:
            return w
    pytest.skip(f"workspace {slug} not found")


def test_templates_list(founder_headers):
    r = requests.get(f"{API}/workspaces/_meta/templates", headers=founder_headers, timeout=20)
    assert r.status_code == 200
    tpls = r.json().get("templates", [])
    ids = {t["id"] for t in tpls}
    assert EXPECTED_TEMPLATES.issubset(ids), f"missing: {EXPECTED_TEMPLATES - ids}"
    for t in tpls:
        assert "id" in t and "label" in t and "icon" in t


def test_templates_requires_auth():
    r = requests.get(f"{API}/workspaces/_meta/templates", timeout=20)
    assert r.status_code in (401, 403)


def test_apply_template_creates_prompt_estructurado(founder_headers):
    ws = _get_workspace(founder_headers, "digiactiva")
    r = requests.post(f"{API}/workspaces/{ws['id']}/apply-template/restaurante",
                      headers=founder_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("template_id") == "restaurante"
    ap = data.get("agent_prompts") or {}
    for ch in ("web_chat", "whatsapp", "voice"):
        assert ap[ch].get("prompt_estructurado"), f"prompt_estructurado missing in {ch}"
    # Verify persistence + applied_template field
    r2 = requests.get(f"{API}/workspaces/{ws['id']}", headers=founder_headers, timeout=20)
    assert r2.status_code == 200
    fresh = r2.json()
    assert fresh.get("applied_template") == "restaurante"
    assert fresh["agent_prompts"]["web_chat"]["prompt_estructurado"]


def test_apply_unknown_template_404(founder_headers):
    ws = _get_workspace(founder_headers, "digiactiva")
    r = requests.post(f"{API}/workspaces/{ws['id']}/apply-template/non_existent",
                      headers=founder_headers, timeout=20)
    assert r.status_code == 404


def test_apply_template_forbidden_for_non_owner(pasta_headers, founder_headers):
    da = _get_workspace(founder_headers, "digiactiva")  # pasta admin doesn't own this
    r = requests.post(f"{API}/workspaces/{da['id']}/apply-template/hotel",
                      headers=pasta_headers, timeout=20)
    assert r.status_code == 403


def test_update_agent_prompts_after_refactor(founder_headers):
    ws = _get_workspace(founder_headers, "digiactiva")
    payload = dict(ws["agent_prompts"]["web_chat"])
    payload["prompt_estructurado"] = "TEST_PROMPT_ESTRUCTURADO_xyz"
    payload["saludo_inicial"] = "TEST_SALUDO 👋"
    r = requests.put(f"{API}/workspaces/{ws['id']}/agent-prompts/web_chat",
                     json=payload, headers=founder_headers, timeout=20)
    assert r.status_code == 200
    assert r.json().get("prompt_estructurado") == "TEST_PROMPT_ESTRUCTURADO_xyz"
    # GET to verify persistence
    r2 = requests.get(f"{API}/workspaces/{ws['id']}", headers=founder_headers, timeout=20)
    assert r2.json()["agent_prompts"]["web_chat"]["prompt_estructurado"] == "TEST_PROMPT_ESTRUCTURADO_xyz"
    assert r2.json()["agent_prompts"]["web_chat"]["saludo_inicial"] == "TEST_SALUDO 👋"


def test_chat_uses_prompt_estructurado_returns_200(founder_headers):
    """POST /api/chat/message with workspace whose web_chat.prompt_estructurado is set."""
    ws = _get_workspace(founder_headers, "digiactiva")
    # Ensure prompt_estructurado is set
    p = dict(ws["agent_prompts"]["web_chat"])
    p["prompt_estructurado"] = "Eres asistente de prueba. Responde brevemente."
    requests.put(f"{API}/workspaces/{ws['id']}/agent-prompts/web_chat", json=p,
                 headers=founder_headers, timeout=20)
    payload = {"workspace": "digiactiva", "session_id": "test-session-niche", "message": "Hola"}
    r = requests.post(f"{API}/chat/message", json=payload, timeout=60)
    # We don't validate model output, only 200 + a response field exists
    assert r.status_code == 200, f"chat failed: {r.status_code} {r.text[:500]}"
    body = r.json()
    assert any(k in body for k in ("response", "reply", "message", "text")), body
