from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.config import load_settings, save_settings, ProviderConfig, AppConfig, set_api_key
from typing import Dict

router = APIRouter()

class ProviderSetupRequest(BaseModel):
    provider_type: str
    api_key: str | None = None
    endpoint: str | None = None
    status: str = "disconnected"

class AppSetupRequest(BaseModel):
    extraction_model: str
    analysis_model: str
    providers: Dict[str, ProviderSetupRequest]

class AvailableModel(BaseModel):
    id: str
    name: str

class ProviderModels(BaseModel):
    provider_type: str
    provider_name: str
    models: list[AvailableModel]

@router.get("/providers")
async def get_providers():
    return load_settings()

@router.post("/providers")
async def setup_providers(payload: AppSetupRequest):
    new_providers = {}
    for pt, config in payload.providers.items():
        new_providers[pt] = ProviderConfig(
            provider_type=config.provider_type,
            endpoint=config.endpoint,
            status=config.status
        )
        if config.api_key:
            set_api_key(pt, config.api_key)
            
    settings = AppConfig(
        extraction_model=payload.extraction_model,
        analysis_model=payload.analysis_model,
        providers=new_providers
    )
    save_settings(settings)
    return {"status": "success"}

@router.get("/models")
async def get_models() -> list[ProviderModels]:
    from app.core.config import get_api_key
    import httpx
    import asyncio

    settings = load_settings()
    results = []
    
    async def fetch_openai():
        config = settings.providers.get("openai")
        if not config or config.status != "connected":
            return None
        api_key = get_api_key("openai")
        if not api_key:
            return ProviderModels(provider_type="openai", provider_name="OpenAI", models=[
                AvailableModel(id="openai/gpt-4o", name="GPT-4o"),
                AvailableModel(id="openai/gpt-4o-mini", name="GPT-4o Mini")
            ])
            
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                res = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                res.raise_for_status()
                data = res.json()
                # Filter to only chat models
                chat_models = [m["id"] for m in data.get("data", []) if "gpt" in m["id"] or "o1" in m["id"]]
                chat_models.sort(reverse=True) # basic sort to put newest first
                models = [AvailableModel(id=f"openai/{m}", name=m) for m in chat_models[:15]]
                return ProviderModels(provider_type="openai", provider_name="OpenAI", models=models)
        except Exception as e:
            print(f"OpenAI discovery failed: {e}")
            return ProviderModels(provider_type="openai", provider_name="OpenAI", models=[
                AvailableModel(id="openai/gpt-4o", name="GPT-4o")
            ])

    async def fetch_anthropic():
        if settings.providers.get("anthropic", ProviderConfig(provider_type="")).status == "connected":
            return ProviderModels(provider_type="anthropic", provider_name="Anthropic", models=[
                AvailableModel(id="anthropic/claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet (New)"),
                AvailableModel(id="anthropic/claude-3-5-sonnet-20240620", name="Claude 3.5 Sonnet"),
                AvailableModel(id="anthropic/claude-3-haiku-20240320", name="Claude 3 Haiku"),
            ])
        return None

    async def fetch_gemini():
        config = settings.providers.get("gemini")
        if not config or config.status != "connected":
            return None
        api_key = get_api_key("gemini")
        if not api_key:
            return ProviderModels(provider_type="gemini", provider_name="Google Gemini", models=[
                AvailableModel(id="gemini/gemini-2.5-flash", name="Gemini 2.5 Flash")
            ])
            
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            async with httpx.AsyncClient(timeout=3) as client:
                res = await client.get(url)
                res.raise_for_status()
                data = res.json()
                # Google returns models as "models/gemini-1.5-flash"
                models = []
                for m in data.get("models", []):
                    if "generateContent" in m.get("supportedGenerationMethods", []):
                        raw_name = m["name"].replace("models/", "")
                        models.append(AvailableModel(id=f"gemini/{raw_name}", name=m.get("displayName", raw_name)))
                return ProviderModels(provider_type="gemini", provider_name="Google Gemini", models=models)
        except Exception as e:
            print(f"Gemini discovery failed: {e}")
            return ProviderModels(provider_type="gemini", provider_name="Google Gemini", models=[
                AvailableModel(id="gemini/gemini-2.5-flash", name="Gemini 2.5 Flash")
            ])

    async def fetch_ollama():
        config = settings.providers.get("ollama")
        if not config or config.status != "connected":
            return None
        url = (config.endpoint or "http://localhost:11434").rstrip("/") + "/api/tags"
        try:
            async with httpx.AsyncClient(timeout=2) as client:
                res = await client.get(url)
                res.raise_for_status()
                data = res.json()
                models = [AvailableModel(id=f"ollama/{m['name']}", name=m['name']) for m in data.get("models", [])]
                if models:
                    return ProviderModels(provider_type="ollama", provider_name="Local (Ollama)", models=models)
        except Exception as e:
            print(f"Ollama discovery failed: {e}")
        return None

    async def fetch_openrouter():
        config = settings.providers.get("openrouter")
        if not config or config.status != "connected":
            return None
        api_key = get_api_key("openrouter")
        if not api_key:
            return ProviderModels(provider_type="openrouter", provider_name="OpenRouter", models=[
                AvailableModel(id="openrouter/openai/gpt-4o", name="GPT-4o via OpenRouter"),
                AvailableModel(id="openrouter/anthropic/claude-3-5-sonnet", name="Claude 3.5 Sonnet via OpenRouter")
            ])
            
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                res = await client.get(
                    "https://openrouter.ai/api/v1/models"
                )
                res.raise_for_status()
                data = res.json()
                models = [AvailableModel(id=f"openrouter/{m['id']}", name=m.get('name', m['id'])) for m in data.get("data", [])]
                return ProviderModels(provider_type="openrouter", provider_name="OpenRouter", models=models)
        except Exception as e:
            print(f"OpenRouter discovery failed: {e}")
            return ProviderModels(provider_type="openrouter", provider_name="OpenRouter", models=[
                AvailableModel(id="openrouter/openai/gpt-4o", name="GPT-4o via OpenRouter")
            ])

    fetched = await asyncio.gather(
        fetch_openai(),
        fetch_anthropic(),
        fetch_gemini(),
        fetch_ollama(),
        fetch_openrouter()
    )
    
    for f in fetched:
        if f:
            results.append(f)

    return results

@router.post("/providers/test")
async def test_provider(payload: ProviderSetupRequest):
    from app.core.config import get_api_key
    import litellm
    import httpx

    try:
        api_key = payload.api_key or get_api_key(payload.provider_type)
        
        if payload.provider_type == "ollama":
            url = (payload.endpoint or "http://localhost:11434").rstrip("/") + "/api/tags"
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(url)
                res.raise_for_status()
            return {"status": "success"}
            
        elif payload.provider_type == "gemini":
            # Programmatic Discovery Test for Gemini (avoids 404s on specific model versions)
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(url)
                if res.status_code != 200:
                    raise Exception(f"Gemini Validation Failed: {res.text}")
            return {"status": "success"}
            
        elif payload.provider_type == "openai":
            # Programmatic Discovery Test for OpenAI
            url = "https://api.openai.com/v1/models"
            headers = {"Authorization": f"Bearer {api_key}"}
            if payload.endpoint:
                url = payload.endpoint.rstrip("/") + "/models"
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(url, headers=headers)
                if res.status_code != 200:
                    raise Exception(f"OpenAI Validation Failed: {res.text}")
            return {"status": "success"}
            
        elif payload.provider_type == "openrouter":
            url = "https://openrouter.ai/api/v1/auth/key"
            headers = {"Authorization": f"Bearer {api_key}"}
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(url, headers=headers)
                if res.status_code != 200:
                    raise Exception(f"OpenRouter Validation Failed: {res.text}")
            return {"status": "success"}
            
        else:
            # Fallback to LiteLLM Dry-Run Probe (Anthropic, etc)
            model = "claude-3-haiku-20240320"
            kwargs = {
                "model": f"{payload.provider_type}/{model}",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 1,
                "api_key": api_key or "dummy"
            }
            if payload.endpoint:
                kwargs["api_base"] = payload.endpoint
            litellm.completion(**kwargs)
            return {"status": "success"}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
