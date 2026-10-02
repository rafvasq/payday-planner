from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.core.llm import parse_csv_with_llm

router = APIRouter()

def dumb_chunk_csv(raw_csv: str, chunk_size: int = 40) -> list[str]:
    """Splits a raw CSV string into safe chunks to avoid LLM output truncation."""
    lines = raw_csv.splitlines()
    return ["\n".join(lines[i:i + chunk_size]) for i in range(0, len(lines), chunk_size)]

@router.post("/parse")
async def parse_csv(file: UploadFile = File(...), provider: str = Form(None)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
    
    # 1. Zero-Logic Decode (In-Memory)
    content = await file.read()
    raw_csv = content.decode("utf-8")
    
    # 2. Dumb Chunking
    chunks = dumb_chunk_csv(raw_csv)
    
    all_transactions = []
    has_errors = False
    
    # 3. Mellea Semantic Normalization
    fallback_warning = None
    
    for chunk in chunks:
        if not chunk.strip():
            continue
        try:
            statement_chunk = parse_csv_with_llm(chunk, provider)
            all_transactions.extend(statement_chunk.transactions)
        except Exception as e:
            # Fallback logic for connection errors
            error_str = str(e).lower()
            if "connection" in error_str or "refused" in error_str or "connecterror" in error_str:
                from app.core.config import load_settings
                settings = load_settings()
                fallback_model = None
                
                # If extraction fails, gracefully fallback to the Analysis Engine (which is usually a robust cloud model)
                if settings.analysis_model and settings.analysis_model != provider:
                    provider_prefix = settings.analysis_model.split('/')[0]
                    if settings.providers.get(provider_prefix) and settings.providers[provider_prefix].status == "connected":
                        fallback_model = settings.analysis_model
                
                if fallback_model:
                    try:
                        print(f"Connection failed. Falling back to {fallback_model}...")
                        statement_chunk = parse_csv_with_llm(chunk, fallback_model)
                        all_transactions.extend(statement_chunk.transactions)
                        fallback_warning = f"Local model unreachable. Falling back to {fallback_model.split('/')[1]} for parsing."
                        continue
                    except Exception as fallback_err:
                        print(f"Fallback failed: {fallback_err}")
            
            print(f"Failed to parse chunk: {e}")
            has_errors = True
            
    # 4. Graceful Degradation UX
    # If a chunk failed (e.g. output truncation or model hallucination), we still return a 200 OK
    # with the successful transactions, but append a deterministic reconciliation flag.
    warning = fallback_warning if fallback_warning else ("chunk_failure" if has_errors else None)
    
    return {
        "transactions": [t.model_dump() for t in all_transactions],
        "warning": warning
    }
