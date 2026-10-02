def test_missing_auth_token_rejected(client):
    """
    Ensures that any request missing the X-Local-Auth-Token header 
    is immediately rejected to prevent CSRF / malicious local scripts.
    """
    response = client.get("/api/health")
    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid or missing X-Local-Auth-Token"

def test_invalid_auth_token_rejected(client):
    response = client.get("/api/health", headers={"X-Local-Auth-Token": "hacker-token"})
    assert response.status_code == 403

def test_valid_auth_token_accepted(client, auth_headers):
    """
    Ensures the VS Code pattern handshake works correctly.
    """
    response = client.get("/api/health", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
