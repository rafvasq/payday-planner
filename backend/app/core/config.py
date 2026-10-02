import json
import os
import keyring
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

CONFIG_DIR = Path.home() / ".payday"
CONFIG_FILE = CONFIG_DIR / "config.json"
KEYRING_SERVICE_NAME = "payday_planner"

class ProviderConfig(BaseModel):
    provider_type: str = "ollama"  # ollama, openai, anthropic, gemini
    endpoint: Optional[str] = None
    status: str = "disconnected"
    
    # Note: We do NOT store the api_key in this Pydantic model directly 
    # to prevent accidental logging or JSON serialization to disk.

class AppConfig(BaseModel):
    extraction_model: str = "ollama/llama3"
    analysis_model: str = "openai/gpt-4o"
    providers: dict[str, ProviderConfig] = {
        "ollama": ProviderConfig(provider_type="ollama")
    }

def _ensure_config_dir():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        CONFIG_FILE.write_text(json.dumps({}))

def load_settings() -> AppConfig:
    _ensure_config_dir()
    try:
        data = json.loads(CONFIG_FILE.read_text())
        return AppConfig(**data)
    except Exception:
        return AppConfig()

def save_settings(settings: AppConfig):
    _ensure_config_dir()
    CONFIG_FILE.write_text(settings.model_dump_json(indent=2))

def get_api_key(provider_type: str) -> Optional[str]:
    """Retrieve API key from OS native credential manager."""
    return keyring.get_password(KEYRING_SERVICE_NAME, provider_type)

def set_api_key(provider_type: str, api_key: str):
    """Store API key securely in OS native credential manager."""
    keyring.set_password(KEYRING_SERVICE_NAME, provider_type, api_key)

def delete_api_key(provider_type: str):
    """Delete API key from OS native credential manager."""
    try:
        keyring.delete_password(KEYRING_SERVICE_NAME, provider_type)
    except keyring.errors.PasswordDeleteError:
        pass
