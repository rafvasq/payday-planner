from unittest.mock import patch
from app.core.llm import Statement, Transaction

# We STRICTLY test our application boundaries (Dumb Chunking and Graceful Degradation).
# We DO NOT test if Mellea or LiteLLM can parse a CSV. We mock the AI.
@patch("app.api.routes_parse.parse_csv_with_llm")
def test_parse_csv_graceful_degradation(mock_llm, client, auth_headers):
    """
    Simulates the Output Truncation / Hallucination UX Blackhole.
    If one chunk succeeds but another chunk causes the LLM to crash, 
    the API should NOT return a 500 error. It should return 200 OK 
    with the rescued transactions and a reconciliation warning.
    """
    
    def side_effect(chunk, provider=None):
        if "Chunk 1" in chunk:
            return Statement(transactions=[
                Transaction(date="2026-09-30", merchant="Coffee", amount=4.50)
            ])
        else:
            # Simulate the LLM hitting an output token limit and breaking the Pydantic parser
            raise ValueError("LLM Output Truncated - Mellea Validation Error")
            
    mock_llm.side_effect = side_effect
    
    # Create a dummy CSV that will be split into 2 chunks (our chunk size is 40)
    csv_content = "Date,Merchant,Amount\n" + ("2026-09-30,Chunk 1,4.50\n" * 39) + "2026-09-30,Chunk 2,5.00\n"
    
    files = {"file": ("statement.csv", csv_content.encode("utf-8"), "text/csv")}
    response = client.post("/api/parse", headers=auth_headers, files=files)
    
    # Assert Graceful Degradation
    assert response.status_code == 200
    data = response.json()
    
    # Assert we successfully rescued the transaction from Chunk 1
    assert len(data["transactions"]) == 1
    assert data["transactions"][0]["merchant"] == "Coffee"
    
    # Assert the deterministic flag is appended for the frontend
    assert data["warning"] == "chunk_failure"
