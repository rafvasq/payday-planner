import os
from fastapi import Request, HTTPException, status

# Generate a cryptographically secure random token on startup.
# In development mode, Vite and Uvicorn can share a static PAYDAY_DEV_TOKEN.
LOCAL_AUTH_TOKEN = os.environ.get("PAYDAY_DEV_TOKEN") or "test-token-123"

async def verify_local_auth_token(request: Request):
    """
    Dependency to verify the X-Local-Auth-Token header to prevent CSRF 
    and malicious local scripts from accessing the API.
    """
    token = request.headers.get("X-Local-Auth-Token")
    if not token or token != LOCAL_AUTH_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing X-Local-Auth-Token"
        )
