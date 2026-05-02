"""Sprint: Onboarding (create-with-admin) + role enforcement tests.
Founder-only flows, workspace_admin restrictions, cross-workspace isolation.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://digiactiva-chile.preview.emergentagent.com").rstrip("/")
FOUNDER = {"email": "founder@digiactiva.com", "password": "digiactiva2025"}
PASTA = {"email": "admin@pastaalvuelo.com", "password": "pastaalvuelo2025"}

TS = int(time.time())
TEST_SLUG = f"test-e2e-{TS}"
TEST_EMAIL = f"test-admin-{TS}@e2e.com"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def founder_token():
    return _login(FOUNDER)


@pytest.fixture(scope="module")
def pasta_token():
    return _login(PASTA)


@pytest.fixture(scope="module")
def created_client(founder_token):
    """Create a workspace+admin once, share for module tests, cleanup after."""
    h = {"Authorization": f"Bearer {founder_token}"}
    body = {
        "workspace": {"name": f"E2E Co {TS}", "slug": TEST_SLUG, "plan": "essential"},
        "admin": {"email": TEST_EMAIL, "full_name": "E2E Admin"},
    }
    r = requests.post(f"{BASE_URL}/api/workspaces/create-with-admin", json=body, headers=h, timeout=20)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    data = r.json()
    yield data
    # cleanup
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")

    async def _cleanup():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.workspaces.delete_one({"id": data["workspace"]["id"]})
        await db.users.delete_one({"id": data["user"]["id"]})

    asyncio.get_event_loop().run_until_complete(_cleanup())


# -------- create-with-admin happy + validation --------

class TestCreateWithAdmin:
    def test_happy_path_returns_credentials(self, created_client):
        d = created_client
        assert d["ok"] is True
        assert d["workspace"]["slug"] == TEST_SLUG
        assert d["workspace"]["plan"] == "essential"
        assert d["user"]["role"] == "workspace_admin"
        assert d["user"]["workspace_ids"] == [d["workspace"]["id"]]
        assert d["user"]["active_workspace_id"] == d["workspace"]["id"]
        creds = d["credentials"]
        assert creds["email"] == TEST_EMAIL
        assert isinstance(creds["password"], str) and len(creds["password"]) == 12
        assert "/crm" in creds["login_url"]

    def test_409_slug_exists(self, founder_token, created_client):
        h = {"Authorization": f"Bearer {founder_token}"}
        body = {"workspace": {"name": "x", "slug": TEST_SLUG, "plan": "essential"},
                "admin": {"email": f"other-{TS}@e2e.com"}}
        r = requests.post(f"{BASE_URL}/api/workspaces/create-with-admin", json=body, headers=h, timeout=15)
        assert r.status_code == 409

    def test_409_email_exists(self, founder_token, created_client):
        h = {"Authorization": f"Bearer {founder_token}"}
        body = {"workspace": {"name": "x", "slug": f"{TEST_SLUG}-2", "plan": "essential"},
                "admin": {"email": TEST_EMAIL}}
        r = requests.post(f"{BASE_URL}/api/workspaces/create-with-admin", json=body, headers=h, timeout=15)
        assert r.status_code == 409

    def test_400_invalid_email(self, founder_token):
        h = {"Authorization": f"Bearer {founder_token}"}
        body = {"workspace": {"name": "x", "slug": f"test-bad-{TS}", "plan": "essential"},
                "admin": {"email": "not-an-email"}}
        r = requests.post(f"{BASE_URL}/api/workspaces/create-with-admin", json=body, headers=h, timeout=15)
        assert r.status_code == 400

    def test_400_short_password(self, founder_token):
        h = {"Authorization": f"Bearer {founder_token}"}
        body = {"workspace": {"name": "x", "slug": f"test-pw-{TS}", "plan": "essential"},
                "admin": {"email": f"shortpw-{TS}@e2e.com", "password": "short"}}
        r = requests.post(f"{BASE_URL}/api/workspaces/create-with-admin", json=body, headers=h, timeout=15)
        assert r.status_code == 400

    def test_403_non_founder_cannot_create(self, pasta_token):
        h = {"Authorization": f"Bearer {pasta_token}"}
        body = {"workspace": {"name": "x", "slug": f"test-403-{TS}", "plan": "essential"},
                "admin": {"email": f"nofnd-{TS}@e2e.com"}}
        r = requests.post(f"{BASE_URL}/api/workspaces/create-with-admin", json=body, headers=h, timeout=15)
        assert r.status_code == 403


# -------- new admin can login --------

class TestNewAdminLogin:
    def test_new_admin_login_works(self, created_client):
        creds = created_client["credentials"]
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": creds["email"], "password": creds["password"]}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "workspace_admin"
        assert data["user"]["workspace_ids"] == [created_client["workspace"]["id"]]
        assert data["user"]["active_workspace_id"] == created_client["workspace"]["id"]


# -------- workspace_admin role enforcement --------

class TestWorkspaceAdminEnforcement:
    @pytest.fixture(scope="class")
    def new_admin_token(self, created_client):
        c = created_client["credentials"]
        return _login({"email": c["email"], "password": c["password"]})

    def test_admin_cannot_toggle_module(self, new_admin_token, created_client):
        h = {"Authorization": f"Bearer {new_admin_token}"}
        ws_id = created_client["workspace"]["id"]
        r = requests.put(f"{BASE_URL}/api/workspaces/{ws_id}/modules/whatsapp_agent",
                         json={"enabled": False}, headers=h, timeout=15)
        assert r.status_code == 403

    def test_admin_cannot_change_plan(self, new_admin_token, created_client):
        h = {"Authorization": f"Bearer {new_admin_token}"}
        ws_id = created_client["workspace"]["id"]
        r = requests.put(f"{BASE_URL}/api/workspaces/{ws_id}",
                         json={"plan": "elite"}, headers=h, timeout=15)
        assert r.status_code == 403

    def test_admin_can_update_agent_prompts(self, new_admin_token, created_client):
        h = {"Authorization": f"Bearer {new_admin_token}"}
        ws_id = created_client["workspace"]["id"]
        # Get current prompt then update
        gw = requests.get(f"{BASE_URL}/api/workspaces/{ws_id}", headers=h, timeout=15)
        assert gw.status_code == 200
        prompt = gw.json().get("agent_prompts", {}).get("web_chat", {}) or {}
        prompt["saludo_inicial"] = "Hola from test"
        r = requests.put(f"{BASE_URL}/api/workspaces/{ws_id}/agent-prompts/web_chat",
                         json=prompt, headers=h, timeout=15)
        assert r.status_code == 200, r.text

    def test_admin_can_update_whatsapp_integration(self, new_admin_token, created_client):
        h = {"Authorization": f"Bearer {new_admin_token}"}
        ws_id = created_client["workspace"]["id"]
        r = requests.put(f"{BASE_URL}/api/workspaces/{ws_id}/integrations/whatsapp",
                         json={"waba_id": "x"}, headers=h, timeout=15)
        # Module enabled in essential plan; should be 200 (module is in plan)
        assert r.status_code == 200, r.text


# -------- list_workspaces leakage --------

class TestListWorkspaceIsolation:
    def test_founder_sees_all(self, founder_token, created_client):
        h = {"Authorization": f"Bearer {founder_token}"}
        r = requests.get(f"{BASE_URL}/api/workspaces", headers=h, timeout=15)
        assert r.status_code == 200
        slugs = [w["slug"] for w in r.json()["workspaces"]]
        assert TEST_SLUG in slugs
        assert "digiactiva" in slugs

    def test_pasta_admin_sees_only_own(self, pasta_token):
        h = {"Authorization": f"Bearer {pasta_token}"}
        r = requests.get(f"{BASE_URL}/api/workspaces", headers=h, timeout=15)
        assert r.status_code == 200
        slugs = [w["slug"] for w in r.json()["workspaces"]]
        assert slugs == ["pasta-al-vuelo"], f"expected only pasta, got {slugs}"

    def test_new_admin_sees_only_own(self, created_client):
        c = created_client["credentials"]
        token = _login({"email": c["email"], "password": c["password"]})
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/api/workspaces", headers=h, timeout=15)
        assert r.status_code == 200
        slugs = [w["slug"] for w in r.json()["workspaces"]]
        assert slugs == [TEST_SLUG]


# -------- reset password --------

class TestResetPassword:
    def test_founder_resets(self, founder_token, created_client):
        h = {"Authorization": f"Bearer {founder_token}"}
        ws_id = created_client["workspace"]["id"]
        user_id = created_client["user"]["id"]
        r = requests.post(f"{BASE_URL}/api/workspaces/{ws_id}/users/{user_id}/reset-password",
                          json={}, headers=h, timeout=15)
        assert r.status_code == 200
        new_pw = r.json()["new_password"]
        assert isinstance(new_pw, str) and len(new_pw) >= 8
        # login with new password
        r2 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": created_client["credentials"]["email"], "password": new_pw}, timeout=15)
        assert r2.status_code == 200

    def test_non_founder_cannot_reset(self, pasta_token, created_client):
        h = {"Authorization": f"Bearer {pasta_token}"}
        ws_id = created_client["workspace"]["id"]
        user_id = created_client["user"]["id"]
        r = requests.post(f"{BASE_URL}/api/workspaces/{ws_id}/users/{user_id}/reset-password",
                          json={}, headers=h, timeout=15)
        assert r.status_code == 403

    def test_404_user_not_in_workspace(self, founder_token):
        h = {"Authorization": f"Bearer {founder_token}"}
        # use pasta-al-vuelo workspace id but a random user id
        wr = requests.get(f"{BASE_URL}/api/workspaces", headers=h, timeout=15).json()
        pasta_id = next(w["id"] for w in wr["workspaces"] if w["slug"] == "pasta-al-vuelo")
        r = requests.post(f"{BASE_URL}/api/workspaces/{pasta_id}/users/nonexistent-uuid/reset-password",
                          json={}, headers=h, timeout=15)
        assert r.status_code == 404


# -------- list workspace users --------

class TestListWorkspaceUsers:
    def test_founder_sees_users(self, founder_token, created_client):
        h = {"Authorization": f"Bearer {founder_token}"}
        ws_id = created_client["workspace"]["id"]
        r = requests.get(f"{BASE_URL}/api/workspaces/{ws_id}/users", headers=h, timeout=15)
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()["users"]]
        assert TEST_EMAIL in emails

    def test_admin_cross_workspace_403(self, pasta_token, created_client):
        h = {"Authorization": f"Bearer {pasta_token}"}
        ws_id = created_client["workspace"]["id"]
        r = requests.get(f"{BASE_URL}/api/workspaces/{ws_id}/users", headers=h, timeout=15)
        assert r.status_code == 403


# -------- cross-workspace CRM isolation --------

class TestCRMIsolation:
    def test_new_admin_sees_no_digiactiva_contacts(self, founder_token, created_client):
        # Reset to a known password (founder action) then login as new admin
        h = {"Authorization": f"Bearer {founder_token}"}
        ws_id = created_client["workspace"]["id"]
        user_id = created_client["user"]["id"]
        rp = requests.post(f"{BASE_URL}/api/workspaces/{ws_id}/users/{user_id}/reset-password",
                           json={"new_password": "TempPass1234"}, headers=h, timeout=15)
        assert rp.status_code == 200
        token = _login({"email": created_client["credentials"]["email"], "password": "TempPass1234"})
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/api/crm/contacts", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = data.get("contacts") or data.get("items") or []
        else:
            items = []
        assert len(items) == 0, f"leakage detected: {len(items)} contacts in new ws"
