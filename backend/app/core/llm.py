import os
import litellm
from mellea import generative
from pydantic import BaseModel
from typing import List
from .config import load_settings, get_api_key

class Transaction(BaseModel):
    date: str
    merchant: str
    amount: float
    card: str | None = None

class Statement(BaseModel):
    transactions: List[Transaction]

def configure_provider(override_id: str = None, job_type: str = "analysis") -> str:
    """
    Sets up the environment for LiteLLM and returns the formatted model string.
    """
    app_settings = load_settings()
    
    default_model = app_settings.extraction_model if job_type == "extraction" else app_settings.analysis_model
    active_model = override_id or default_model
    
    if not active_model or "/" not in active_model:
        raise ValueError("Invalid model ID format. Expected 'provider/model'.")
        
    provider_type, model = active_model.split("/", 1)
    
    settings = app_settings.providers.get(provider_type)
    
    if not settings:
        raise ValueError(f"Provider '{provider_type}' is not configured.")
        
    api_key = get_api_key(settings.provider_type)
    
    if settings.provider_type == "openai":
        os.environ["OPENAI_API_KEY"] = api_key or ""
    elif settings.provider_type == "anthropic":
        os.environ["ANTHROPIC_API_KEY"] = api_key or ""
    elif settings.provider_type == "gemini":
        os.environ["GEMINI_API_KEY"] = api_key or ""
    elif settings.provider_type == "openrouter":
        os.environ["OPENROUTER_API_KEY"] = api_key or ""

    if settings.endpoint:
        litellm.api_base = settings.endpoint
        
    prefix = "" if settings.provider_type == "ollama" and model.startswith("ollama/") else f"{settings.provider_type}/"
    return f"{prefix}{model}"

from mellea import generative, start_session

def parse_csv_with_llm(csv_chunk: str, override_id: str = None) -> Statement:
    """
    Uses Mellea to semantically normalize a chunk of a raw CSV string into a strictly typed Pydantic schema.
    """
    model_name = configure_provider(override_id=override_id, job_type="extraction")
    
    # Define the generative stub (no arguments passed to the decorator)
    @generative
    def _extract(data: str) -> Statement:
        """
        You are a financial data extractor. Extract the transactions from this raw CSV string.
        Clean the merchant names (remove POS garbage, location IDs), standardize dates to YYYY-MM-DD, 
        and ensure amounts are absolute floats.
        If a card or account identifier is present, extract it to the 'card' field (e.g. '*1234' or 'Visa').
        CRITICAL: Ignore and completely exclude any 'Payment', 'Transfer', or 'Credit Card Bill' rows. 
        Only extract genuine external spending/income. Ignore metadata headers.
        """
        pass
        
    # Start the Mellea session using the litellm backend
    session = start_session(backend_name="litellm", model_id=model_name)
    
    # Execute the generative function using the session
    return _extract(m=session, data=csv_chunk)
