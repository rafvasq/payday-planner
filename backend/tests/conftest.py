import pytest
import os
from unittest.mock import patch
from fastapi.testclient import TestClient

# 1. THE CI/CD SAVIOR: Mock keyring globally BEFORE any app modules are imported.
patch("keyring.get_password", return_value="mock-api-key").start()
patch("keyring.set_password", return_value=None).start()
patch("keyring.delete_password", return_value=None).start()

# 2. SET STATIC DEV TOKEN: Predictable auth for testing
os.environ["PAYDAY_DEV_TOKEN"] = "test-token-123"

# Fix Python path so pytest can find the app module
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Now it is safe to import our FastAPI app
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def auth_headers():
    return {"X-Local-Auth-Token": "test-token-123"}
