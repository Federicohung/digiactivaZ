"""
Inbox (omnichannel) tests — covers /api/inbox/* endpoints + SSE + webhook integration.
"""
import os
import time
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://digiactiva-chile.preview.emergentagent.com").rstrip("/")
ENV_FILE = "/app/backend/.env"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j


@pytest.fixture(scope="module")
def founder():
    token, body = _login("founder@digiactiva.com", "digiactiva2025")
    return {"token": token, "body": body, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def pasta():
    token, body = _login("admin@pastaalvuelo.com", "pastaalvuelo2025")
    return {"token": token, "body": body, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def digiactiva_ws_id(founder):
    u = founder["body"].get("user") or {}
    wsid = u.get("active_workspace_id")
    if wsid:
        return wsid
    pytest.skip("no digiactiva workspace id available")


# ---------------- Summary ----------------
class TestSummary:
    def test_summary_founder(self, founder):
        r = requests.get(f"{BASE_URL}/api/inbox/summary", headers=founder["headers"], timeout=10)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "workspace_id" in j
        assert j.get("plan_allows") is True
        t = j.get("total") or {}
        for k in ("open", "pending", "closed", "unread", "total"):
            assert k in t, f"missing {k}"
        assert "by_channel" in j

    def test_summary_pasta_premium(self, pasta):
        r = requests.get(f"{BASE_URL}/api/inbox/summary", headers=pasta["headers"], timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("plan_allows") is True


# ---------------- Conversations list ----------------
class TestList:
    def test_list_default(self, founder):
        r = requests.get(f"{BASE_URL}/api/inbox/conversations", headers=founder["headers"], timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j
        if len(j["items"]) > 1:
            prev = j["items"][0].get("last_message_at") or ""
            for it in j["items"][1:]:
                cur = it.get("last_message_at") or ""
                assert cur <= prev, "not sorted DESC"
                prev = cur

    @pytest.mark.parametrize("ch", ["instagram", "whatsapp", "messenger"])
    def test_list_filter_channel(self, founder, ch):
        r = requests.get(f"{BASE_URL}/api/inbox/conversations", params={"channel": ch}, headers=founder["headers"], timeout=10)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["channel"] == ch

    def test_list_filter_status(self, founder):
        r = requests.get(f"{BASE_URL}/api/inbox/conversations", params={"status": "open"}, headers=founder["headers"], timeout=10)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "open"

    def test_list_unread_only(self, founder):
        r = requests.get(f"{BASE_URL}/api/inbox/conversations", params={"unread_only": "true"}, headers=founder["headers"], timeout=10)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert (it.get("unread_count") or 0) > 0

    def test_list_search(self, founder):
        r = requests.get(f"{BASE_URL}/api/inbox/conversations", params={"search": "a"}, headers=founder["headers"], timeout=10)
        assert r.status_code == 200


# ---------------- Messages ----------------
class TestMessages:
    def test_messages_of_existing_conv(self, founder):
        lst = requests.get(f"{BASE_URL}/api/inbox/conversations?limit=5", headers=founder["headers"], timeout=10).json()["items"]
        if not lst:
            pytest.skip("no conversations available")
        cid = lst[0]["id"]
        r = requests.get(f"{BASE_URL}/api/inbox/conversations/{cid}/messages", headers=founder["headers"], timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert j["conversation"]["id"] == cid
        assert isinstance(j["messages"], list)

    def test_messages_404_invalid(self, founder):
        r = requests.get(f"{BASE_URL}/api/inbox/conversations/does-not-exist/messages", headers=founder["headers"], timeout=10)
        assert r.status_code == 404

    def test_cross_workspace_isolation(self, founder, pasta):
        # Pick a digiactiva conv via founder, try to access with pasta admin
        items = requests.get(f"{BASE_URL}/api/inbox/conversations", headers=founder["headers"], timeout=10).json()["items"]
        # pasta admin should see only pasta conversations; try a founder/digiactiva one
        pasta_items = requests.get(f"{BASE_URL}/api/inbox/conversations", headers=pasta["headers"], timeout=10).json()["items"]
        pasta_ids = {it["id"] for it in pasta_items}
        target = None
        for it in items:
            if it["id"] not in pasta_ids:
                target = it["id"]
                break
        if not target:
            pytest.skip("no conv unique to founder workspace")
        r = requests.get(f"{BASE_URL}/api/inbox/conversations/{target}/messages", headers=pasta["headers"], timeout=10)
        assert r.status_code == 404


# ---------------- Read / Patch ----------------
class TestReadPatch:
    def test_mark_read_decreases_unread(self, founder):
        summ_before = requests.get(f"{BASE_URL}/api/inbox/summary", headers=founder["headers"], timeout=10).json()
        unread_before = (summ_before.get("total") or {}).get("unread", 0)
        # Find an unread conv
        items = requests.get(f"{BASE_URL}/api/inbox/conversations?unread_only=true", headers=founder["headers"], timeout=10).json()["items"]
        if not items:
            pytest.skip("no unread conv to mark as read")
        cid = items[0]["id"]
        cur_unread = items[0].get("unread_count") or 0
        r = requests.post(f"{BASE_URL}/api/inbox/conversations/{cid}/read", headers=founder["headers"], timeout=10)
        assert r.status_code == 200
        summ_after = requests.get(f"{BASE_URL}/api/inbox/summary", headers=founder["headers"], timeout=10).json()
        unread_after = (summ_after.get("total") or {}).get("unread", 0)
        assert unread_after <= unread_before - 1 or unread_after <= max(0, unread_before - cur_unread)

    def test_patch_status_and_tags(self, founder):
        items = requests.get(f"{BASE_URL}/api/inbox/conversations?limit=5", headers=founder["headers"], timeout=10).json()["items"]
        if not items:
            pytest.skip("no conv")
        cid = items[0]["id"]
        r = requests.patch(f"{BASE_URL}/api/inbox/conversations/{cid}", json={"status": "closed", "tags": ["vip", "test"]}, headers=founder["headers"], timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "closed"
        assert set(body["tags"]) == {"vip", "test"}
        # Re-fetch to confirm persistence
        fresh = requests.get(f"{BASE_URL}/api/inbox/conversations/{cid}/messages", headers=founder["headers"], timeout=10).json()["conversation"]
        assert fresh["status"] == "closed"
        # Restore to open
        requests.patch(f"{BASE_URL}/api/inbox/conversations/{cid}", json={"status": "open", "tags": []}, headers=founder["headers"], timeout=10)

    def test_patch_empty_400(self, founder):
        items = requests.get(f"{BASE_URL}/api/inbox/conversations?limit=1", headers=founder["headers"], timeout=10).json()["items"]
        if not items:
            pytest.skip("no conv")
        cid = items[0]["id"]
        r = requests.patch(f"{BASE_URL}/api/inbox/conversations/{cid}", json={}, headers=founder["headers"], timeout=10)
        assert r.status_code == 400

    def test_patch_invalid_status_422(self, founder):
        items = requests.get(f"{BASE_URL}/api/inbox/conversations?limit=1", headers=founder["headers"], timeout=10).json()["items"]
        if not items:
            pytest.skip("no conv")
        cid = items[0]["id"]
        r = requests.patch(f"{BASE_URL}/api/inbox/conversations/{cid}", json={"status": "banana"}, headers=founder["headers"], timeout=10)
        assert r.status_code == 422


# ---------------- Send ----------------
class TestSend:
    def test_send_web_chat_409(self, founder):
        items = requests.get(f"{BASE_URL}/api/inbox/conversations?channel=web_chat", headers=founder["headers"], timeout=10).json()["items"]
        if not items:
            pytest.skip("no web_chat conv available")
        cid = items[0]["id"]
        r = requests.post(f"{BASE_URL}/api/inbox/conversations/{cid}/send", json={"message": "hola"}, headers=founder["headers"], timeout=15)
        assert r.status_code == 409
        assert "web_chat" in r.text.lower()

    def test_send_instagram_persists_failed(self, founder):
        items = requests.get(f"{BASE_URL}/api/inbox/conversations?channel=instagram", headers=founder["headers"], timeout=10).json()["items"]
        if not items:
            pytest.skip("no instagram conv")
        cid = items[0]["id"]
        r = requests.post(f"{BASE_URL}/api/inbox/conversations/{cid}/send", json={"message": "TEST inbox outbound"}, headers=founder["headers"], timeout=20)
        # 200 expected — send_result.ok=false but persisted
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert (j.get("send_result") or {}).get("ok") in (False, None)
        assert (j.get("message") or {}).get("status") == "failed"
        # Verify in messages list
        msgs = requests.get(f"{BASE_URL}/api/inbox/conversations/{cid}/messages", headers=founder["headers"], timeout=10).json()["messages"]
        assert any(m.get("body") == "TEST inbox outbound" for m in msgs)


# ---------------- Webhook integration ----------------
class TestWebhookIntegration:
    def test_webhook_dev_creates_inbox_conv(self, founder, digiactiva_ws_id):
        # Toggle ENVIRONMENT=development
        try:
            with open(ENV_FILE, "r") as f:
                orig = f.read()
            new = []
            found = False
            for line in orig.splitlines():
                if line.startswith("ENVIRONMENT="):
                    new.append("ENVIRONMENT=development")
                    found = True
                else:
                    new.append(line)
            if not found:
                new.append("ENVIRONMENT=development")
            with open(ENV_FILE, "w") as f:
                f.write("\n".join(new) + "\n")
            os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
            time.sleep(6)

            # Baseline summary
            s0 = requests.get(f"{BASE_URL}/api/inbox/summary", headers=founder["headers"], timeout=10).json()
            unread0 = (s0.get("total") or {}).get("unread", 0)

            # Post webhook
            sender = f"inbox_e2e_test_{int(time.time())}"
            payload = {
                "trigger": "INSTAGRAM_RECEIVE_MESSAGE",
                "data": {"sender_id": sender, "message": "msg from sse test", "text": "msg from sse test"},
            }
            # ws param name: digiactiva workspace id
            r = requests.post(
                f"{BASE_URL}/api/composio/webhook",
                params={"ws": digiactiva_ws_id},
                json=payload, timeout=15,
            )
            assert r.status_code == 200, f"webhook: {r.status_code} {r.text}"

            time.sleep(1)
            s1 = requests.get(f"{BASE_URL}/api/inbox/summary", headers=founder["headers"], timeout=10).json()
            unread1 = (s1.get("total") or {}).get("unread", 0)
            assert unread1 > unread0, f"unread did not grow {unread0}->{unread1}"

            uitems = requests.get(f"{BASE_URL}/api/inbox/conversations?unread_only=true&channel=instagram", headers=founder["headers"], timeout=10).json()["items"]
            assert any((it.get("external_sender_id") == sender) or ("inbox_e2e_test" in (it.get("last_message_preview") or "")) or (it.get("contact", {}).get("instagram_id") == sender) for it in uitems), "new conv not found"
        finally:
            # Restore ENVIRONMENT=production
            with open(ENV_FILE, "r") as f:
                cur = f.read()
            new2 = []
            touched = False
            for line in cur.splitlines():
                if line.startswith("ENVIRONMENT="):
                    new2.append("ENVIRONMENT=production")
                    touched = True
                else:
                    new2.append(line)
            if not touched:
                new2.append("ENVIRONMENT=production")
            with open(ENV_FILE, "w") as f:
                f.write("\n".join(new2) + "\n")
            os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
            time.sleep(5)


# ---------------- SSE ----------------
class TestSSE:
    def test_sse_connected_comment(self, founder):
        url = f"{BASE_URL}/api/inbox/events?token={founder['token']}"
        with requests.get(url, stream=True, timeout=10) as r:
            assert r.status_code == 200
            assert "text/event-stream" in (r.headers.get("content-type", ""))
            t0 = time.time()
            got = b""
            for chunk in r.iter_content(chunk_size=64):
                got += chunk
                if b"connected" in got or time.time() - t0 > 3:
                    break
            assert b"connected" in got, got[:200]

    def test_sse_invalid_token_401(self):
        r = requests.get(f"{BASE_URL}/api/inbox/events?token=invalid", timeout=10)
        assert r.status_code == 401


# ---------------- Regression ----------------
class TestRegression:
    @pytest.mark.parametrize("path", [
        "/api/crm/contacts", "/api/crm/metrics", "/api/crm/pipeline",
        "/api/crm/settings", "/api/crm/ai/logs",
    ])
    def test_crm_endpoints(self, founder, path):
        r = requests.get(f"{BASE_URL}{path}", headers=founder["headers"], timeout=15)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
