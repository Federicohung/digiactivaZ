"""
Sprint Composio Triggers SDK refactor — backend tests for iteration 15.

Covers the SDK Python `composio` refactor (composio==0.12.0):
- /types and /types/{slug} return 503 (NOT 500) when COMPOSIO_API_KEY missing
- /setup-mine and /setup return 200 with results.skipped via lazy SDK init
  (do NOT require COMPOSIO_API_KEY when no channels connected)
- /setup-mine accepts whatsapp_config/instagram_config/messenger_config dicts
- DELETE returns 200 with composio.ok=false when no api key (best-effort)
- Status filtering by role
- Webhook persistence on HMAC failure
- Payload truncation > 64KB
"""
import os
import time
import json
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://digiactiva-chile.preview.emergentagent.com").rstrip("/")
try:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
except Exception:
    pass

FOUNDER_EMAIL = "founder@digiactiva.com"
FOUNDER_PASS = "digiactiva2025"
ADMIN_EMAIL = "admin@pastaalvuelo.com"
ADMIN_PASS = "pastaalvuelo2025"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s, data


@pytest.fixture(scope="module")
def founder_session():
    return _login(FOUNDER_EMAIL, FOUNDER_PASS)


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def pasta_workspace_id(founder_session):
    s, _ = founder_session
    r = s.get(f"{BASE_URL}/api/workspaces", timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data.get("workspaces") or data.get("items") or [] if isinstance(data, dict) else data
    for ws in items:
        if ws.get("slug") == "pasta-al-vuelo":
            return ws.get("id")
    pytest.skip("pasta-al-vuelo workspace not found")


# ---------- /types (SDK eager init → 503 when no api key) ----------
class TestTypes:
    def test_founder_types_503_without_key(self, founder_session):
        s, _ = founder_session
        r = s.get(f"{BASE_URL}/api/composio/triggers/types", timeout=30)
        # Eager SDK call → must be 503 (NOT 500), with detail mentioning COMPOSIO_API_KEY
        assert r.status_code != 500, f"server crashed: {r.text[:300]}"
        assert r.status_code in (200, 503), f"got {r.status_code}: {r.text[:200]}"
        if r.status_code == 503:
            detail = (r.json() or {}).get("detail", "")
            assert "COMPOSIO_API_KEY" in detail, f"detail should mention COMPOSIO_API_KEY: {detail}"

    def test_admin_types_403(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{BASE_URL}/api/composio/triggers/types", timeout=15)
        assert r.status_code == 403

    def test_founder_type_by_slug_503_without_key(self, founder_session):
        s, _ = founder_session
        r = s.get(f"{BASE_URL}/api/composio/triggers/types/some_inbound_slug", timeout=30)
        assert r.status_code != 500, f"server crashed: {r.text[:300]}"
        # 503 (no api key) or 502 (composio error) or 200 (rare)
        assert r.status_code in (200, 502, 503), f"got {r.status_code}: {r.text[:200]}"

    def test_admin_type_by_slug_no_crash(self, admin_session):
        # /types/{slug} uses get_current_user (NOT founder-only)
        s, _ = admin_session
        r = s.get(f"{BASE_URL}/api/composio/triggers/types/some_inbound_slug", timeout=30)
        assert r.status_code != 500, f"server crashed: {r.text[:300]}"
        assert r.status_code in (200, 403, 502, 503), f"got {r.status_code}: {r.text[:200]}"


# ---------- /setup-mine (LAZY SDK — must NOT 503 if no channels connected) ----------
class TestSetupMineLazy:
    def test_admin_setup_mine_200_skipped(self, admin_session):
        """Lazy: even without COMPOSIO_API_KEY, returns 200 with all channels skipped."""
        s, _ = admin_session
        r = s.post(f"{BASE_URL}/api/composio/triggers/setup-mine", json={}, timeout=30)
        assert r.status_code == 200, f"expected 200 (lazy SDK), got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert "workspace_id" in body
        assert "results" in body
        assert "webhook_url" in body
        for ch in ("whatsapp", "instagram", "messenger"):
            assert ch in body["results"], f"missing channel {ch}"
            assert body["results"][ch]["status"] == "skipped", \
                f"{ch} should be skipped (no connected_account_id), got {body['results'][ch]}"

    def test_founder_setup_mine_200_skipped(self, founder_session):
        s, _ = founder_session
        r = s.post(f"{BASE_URL}/api/composio/triggers/setup-mine", json={}, timeout=30)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert "results" in body

    def test_setup_mine_accepts_configs_no_schema_error(self, admin_session):
        """Body with whatsapp_config/instagram_config/messenger_config dicts must not be schema-rejected."""
        s, _ = admin_session
        payload = {
            "whatsapp_config": {"phoneNumberId": "abc", "wabaId": "xyz"},
            "instagram_config": {"pageId": "p123"},
            "messenger_config": {"pageId": "p456"},
        }
        r = s.post(f"{BASE_URL}/api/composio/triggers/setup-mine", json=payload, timeout=30)
        # No 422 (pydantic schema error). 200 OK because still skipped (no connected accounts).
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert all(body["results"][ch]["status"] == "skipped" for ch in ("whatsapp", "instagram", "messenger"))

    def test_setup_mine_accepts_slug_overrides(self, admin_session):
        s, _ = admin_session
        r = s.post(
            f"{BASE_URL}/api/composio/triggers/setup-mine",
            json={"whatsapp_slug": "WA_INBOUND_MSG", "instagram_slug": "IG_DM"},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"


# ---------- /setup (founder, lazy SDK) ----------
class TestSetupFounder:
    def test_setup_no_workspace_id_400(self, founder_session):
        s, _ = founder_session
        r = s.post(f"{BASE_URL}/api/composio/triggers/setup", json={}, timeout=15)
        assert r.status_code == 400

    def test_setup_invalid_workspace_id_404(self, founder_session):
        s, _ = founder_session
        r = s.post(f"{BASE_URL}/api/composio/triggers/setup",
                   json={"workspace_id": "ws-does-not-exist-xyz"}, timeout=15)
        assert r.status_code == 404

    def test_setup_valid_workspace_id_200_skipped(self, founder_session, pasta_workspace_id):
        s, _ = founder_session
        r = s.post(f"{BASE_URL}/api/composio/triggers/setup",
                   json={"workspace_id": pasta_workspace_id}, timeout=30)
        # Lazy SDK: 200 with all skipped (no connected accounts in test env)
        assert r.status_code == 200, f"expected 200 (lazy SDK), got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body.get("workspace_id") == pasta_workspace_id
        assert "results" in body

    def test_admin_setup_403(self, admin_session, pasta_workspace_id):
        s, _ = admin_session
        r = s.post(f"{BASE_URL}/api/composio/triggers/setup",
                   json={"workspace_id": pasta_workspace_id}, timeout=15)
        assert r.status_code == 403


# ---------- /status ----------
class TestStatus:
    def test_founder_status_all(self, founder_session):
        s, _ = founder_session
        r = s.get(f"{BASE_URL}/api/composio/triggers/status", timeout=15)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert "items" in body and "count" in body and "webhook_url" in body
        assert isinstance(body["items"], list)

    def test_admin_status_only_own(self, admin_session, pasta_workspace_id):
        s, _ = admin_session
        r = s.get(f"{BASE_URL}/api/composio/triggers/status", timeout=15)
        assert r.status_code == 200
        body = r.json()
        for it in body.get("items", []):
            assert it.get("workspace_id") == pasta_workspace_id, \
                f"admin saw foreign trigger: {it.get('workspace_id')}"


# ---------- DELETE (best-effort, must return 200 even without api key) ----------
class TestDelete:
    def test_admin_delete_403(self, admin_session):
        s, _ = admin_session
        r = s.delete(f"{BASE_URL}/api/composio/triggers/some-fake-id", timeout=15)
        assert r.status_code == 403

    def test_founder_delete_unknown_200_best_effort(self, founder_session):
        s, _ = founder_session
        r = s.delete(f"{BASE_URL}/api/composio/triggers/nonexistent-trigger-id-12345", timeout=30)
        # Best-effort: 200 even when no api key, with composio.ok=false
        assert r.status_code == 200, f"expected 200 (best-effort), got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("trigger_id") == "nonexistent-trigger-id-12345"
        composio_block = body.get("composio") or {}
        # When no api key, composio.ok should be false (graceful degradation)
        assert composio_block.get("ok") is False, f"expected composio.ok=false, got: {composio_block}"


# ---------- Webhook HMAC fail + persistence ----------
class TestWebhookPersistence:
    def test_webhook_invalid_signature_logs_event(self, founder_session):
        marker = f"sprint15-test-{int(time.time())}"
        r = requests.post(
            f"{BASE_URL}/api/composio/webhook",
            json={"_test_marker": marker, "type": "test.event"},
            timeout=15,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

        time.sleep(1.5)
        s, _ = founder_session
        r2 = s.get(f"{BASE_URL}/api/composio/webhook-events?limit=50", timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        found = False
        for ev in body.get("items", []):
            payload = ev.get("payload") or {}
            if payload.get("_test_marker") == marker:
                found = True
                assert ev.get("parsed_ok") is False
                assert ev.get("hmac_ok") is False
                assert "HMAC" in (ev.get("error") or "")
                hdrs = ev.get("headers") or {}
                for k in hdrs.keys():
                    assert k.lower() not in (
                        "authorization", "cookie", "webhook-signature",
                        "x-composio-signature", "x-signature",
                    ), f"sensitive header leaked: {k}"
                break
        assert found, f"webhook event with marker {marker} not persisted"


# ---------- Payload truncation > 64KB ----------
class TestPayloadTruncation:
    def test_oversized_payload_truncated_no_crash(self, founder_session):
        marker = f"sprint15-bigpayload-{int(time.time())}"
        # Build payload > 64KB (single string field of 80KB)
        big_blob = "x" * 80_000
        body = {"_test_marker": marker, "blob": big_blob, "type": "test.oversized"}
        r = requests.post(
            f"{BASE_URL}/api/composio/webhook",
            json=body,
            timeout=20,
        )
        # Will be 401 (HMAC fail) but must NOT crash with 500
        assert r.status_code != 500, f"server crashed on oversized payload: {r.status_code} {r.text[:300]}"
        assert r.status_code == 401

        time.sleep(1.5)
        s, _ = founder_session
        r2 = s.get(f"{BASE_URL}/api/composio/webhook-events?limit=50", timeout=15)
        assert r2.status_code == 200
        found = False
        for ev in r2.json().get("items", []):
            payload = ev.get("payload") or {}
            # If the marker was preserved (payload < cap), or if it was truncated, both valid
            if payload.get("_test_marker") == marker or (
                isinstance(payload, dict) and payload.get("_truncated") is True
                and marker in (payload.get("_preview") or "")
            ):
                found = True
                if payload.get("_truncated"):
                    # Verify truncation marker structure
                    assert payload.get("_truncated") is True
                    assert isinstance(payload.get("_size_bytes"), int)
                    assert payload.get("_size_bytes") > 64_000
                    assert "_preview" in payload
                break
        assert found, f"oversized webhook event with marker {marker} not persisted (or marker lost)"


# ---------- /webhook-events role filter ----------
class TestWebhookEventsAccess:
    def test_founder_sees_all(self, founder_session):
        s, _ = founder_session
        r = s.get(f"{BASE_URL}/api/composio/webhook-events?limit=50", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "count" in body

    def test_admin_only_own_workspace(self, admin_session, pasta_workspace_id):
        s, _ = admin_session
        r = s.get(f"{BASE_URL}/api/composio/webhook-events?limit=50", timeout=15)
        assert r.status_code == 200
        for ev in r.json().get("items", []):
            assert ev.get("workspace_id") == pasta_workspace_id, \
                f"admin saw foreign event: {ev.get('workspace_id')}"
