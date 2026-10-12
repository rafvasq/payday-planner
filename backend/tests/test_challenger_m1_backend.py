import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.api.tools_schema import export_tools
from app.api.routes_chat import ChatRequest, ChatMessage

def test_tools_schema_definitions():
    """Verify tools_schema.py defines all 5 tools with valid OpenAI function schemas."""
    tool_names = [t["function"]["name"] for t in export_tools]
    assert len(tool_names) == 5, f"Expected 5 tools, got {len(tool_names)}: {tool_names}"
    expected_tools = {"get_snapshot", "get_schedule", "simulate", "propose_blueprint_changes", "record_actual"}
    assert set(tool_names) == expected_tools, f"Missing or extra tools: {set(tool_names) ^ expected_tools}"

    for tool in export_tools:
        assert tool.get("type") == "function", f"{tool} must have type: 'function'"
        fn = tool.get("function", {})
        assert fn.get("name") in expected_tools
        assert isinstance(fn.get("description"), str) and len(fn["description"]) > 10
        params = fn.get("parameters", {})
        assert params.get("type") == "object", f"{fn['name']} parameters must be type 'object'"
        assert "properties" in params

    # Check simulate schema
    simulate = next(t["function"] for t in export_tools if t["function"]["name"] == "simulate")
    assert "label" in simulate["parameters"]["required"]
    assert "changes" in simulate["parameters"]["required"]
    assert simulate["parameters"]["properties"]["changes"]["type"] == "array"
    assert simulate["parameters"]["properties"]["changes"]["minItems"] == 1

    # Check propose_blueprint_changes schema
    propose = next(t["function"] for t in export_tools if t["function"]["name"] == "propose_blueprint_changes")
    assert "label" in propose["parameters"]["required"]
    assert "changes" in propose["parameters"]["required"]

    # Check record_actual schema
    record = next(t["function"] for t in export_tools if t["function"]["name"] == "record_actual")
    assert "description" in record["parameters"]["required"]
    assert "transactions" in record["parameters"]["required"]
    assert record["parameters"]["properties"]["transactions"]["type"] == "array"

def test_blueprint_json_dumps_serialization():
    """Verify json.dumps on blueprint produces valid standard JSON (true/false/null, double quotes)."""
    blueprint_input = {
        "accounts": [
            {"id": "acc-1", "name": "Checking", "balance": 1500.50, "is_cash": True, "notes": None}
        ],
        "events": [
            {"id": "ev-1", "name": "Salary", "amount": 3000, "is_recurring": True, "skip": False}
        ],
        "startingBalancesReflectToday": False,
        "metadata": {"empty_val": None}
    }
    dumped = json.dumps(blueprint_input, indent=2)

    # Must NOT contain Python representations
    assert "True" not in dumped, "Blueprint JSON contains Python 'True' instead of 'true'"
    assert "False" not in dumped, "Blueprint JSON contains Python 'False' instead of 'false'"
    assert "None" not in dumped, "Blueprint JSON contains Python 'None' instead of 'null'"
    assert "'" not in dumped, "Blueprint JSON contains single quotes instead of double quotes"

    # Must round-trip perfectly with standard json.loads
    parsed = json.loads(dumped)
    assert parsed == blueprint_input
    assert parsed["accounts"][0]["is_cash"] is True
    assert parsed["accounts"][0]["notes"] is None
    assert parsed["startingBalancesReflectToday"] is False

def test_routes_chat_message_history_preservation(client, auth_headers):
    """
    CRITICAL ADVERSARIAL TEST:
    Verify whether routes_chat preserves conversation history in multi-turn chats.
    In routes_chat.py line 114, messages.append(msg_dict) is indented inside
    'if i == len(payload.messages) - 1:', meaning previous messages are dropped!
    """
    payload = {
        "messages": [
            {"role": "user", "content": "What is my balance?"},
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_123",
                        "type": "function",
                        "function": {"name": "get_snapshot", "arguments": "{}"}
                    }
                ]
            },
            {"role": "tool", "name": "get_snapshot", "tool_call_id": "call_123", "content": '{"status":"ok"}'}
        ],
        "blueprint": {"accounts": []},
        "ledger_context": "Ledger context info",
        "chat_mode": "tactical"
    }

    mock_chunk = MagicMock()
    mock_chunk.choices = []

    async def mock_stream(*args, **kwargs):
        yield mock_chunk

    with patch("app.api.routes_chat.configure_provider", return_value="mock-model"):
        with patch("app.api.routes_chat.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
            mock_acompletion.return_value = mock_stream()

            response = client.post("/api/chat", json=payload, headers=auth_headers)
            assert response.status_code == 200

            # Inspect the messages passed to litellm.acompletion
            assert mock_acompletion.called, "litellm.acompletion was never called"
            call_kwargs = mock_acompletion.call_args.kwargs
            sent_messages = call_kwargs["messages"]

            # We expect: system prompt (1) + user msg (1) + assistant tool call (1) + tool result (1) = 4 messages
            # If the indentation bug exists, only system prompt + tool result (2 messages) are sent!
            print(f"\nSent messages count: {len(sent_messages)}")
            for idx, m in enumerate(sent_messages):
                print(f"  [{idx}] role: {m.get('role')} | content: {repr(m.get('content'))[:40]}")

            roles = [m["role"] for m in sent_messages]
            assert "user" in roles, (
                f"BUG CONFIRMED: User message was dropped from conversation history! "
                f"sent_messages roles: {roles}. Indentation error in routes_chat.py line 114."
            )
            assert "assistant" in roles, (
                f"BUG CONFIRMED: Assistant tool call message was dropped from conversation history! "
                f"sent_messages roles: {roles}. Indentation error in routes_chat.py line 114."
            )
            assert len(sent_messages) == 4, f"Expected 4 messages, but only {len(sent_messages)} were sent: {roles}"

def test_multi_turn_extended_history_and_state_injection(client, auth_headers):
    """
    STRESS TEST:
    Verify that in a 7-turn conversation (user, assistant, user, assistant_tool, tool, assistant_tool, tool):
    - All 7 messages are preserved in sent_messages plus system prompt = 8 total.
    - Earlier messages are NOT corrupted by state injection.
    - Only the final message receives the '--- LATEST LIVE SYSTEM STATE ---' block.
    """
    payload = {
        "messages": [
            {"role": "user", "content": "Turn 1: Hello"},
            {"role": "assistant", "content": "Turn 2: Hi there!"},
            {"role": "user", "content": "Turn 3: Check my cash."},
            {
                "role": "assistant",
                "content": "Turn 4: Checking...",
                "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "get_snapshot", "arguments": "{}"}}]
            },
            {"role": "tool", "name": "get_snapshot", "tool_call_id": "call_1", "content": '{"status":"ok"}'},
            {
                "role": "assistant",
                "content": "Turn 6: Now checking schedule...",
                "tool_calls": [{"id": "call_2", "type": "function", "function": {"name": "get_schedule", "arguments": "{}"}}]
            },
            {"role": "tool", "name": "get_schedule", "tool_call_id": "call_2", "content": '{"events":[]}'}
        ],
        "blueprint": {"accounts": [{"id": "acc-1", "name": "Checking", "balance": 500}]},
        "ledger_context": "Ledger Oct 11",
        "spending_summary": "Spending: $200",
        "chat_mode": "tactical"
    }

    mock_chunk = MagicMock()
    mock_chunk.choices = []

    async def mock_stream(*args, **kwargs):
        yield mock_chunk

    with patch("app.api.routes_chat.configure_provider", return_value="mock-model"):
        with patch("app.api.routes_chat.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
            mock_acompletion.return_value = mock_stream()

            response = client.post("/api/chat", json=payload, headers=auth_headers)
            assert response.status_code == 200
            assert mock_acompletion.called

            sent_messages = mock_acompletion.call_args.kwargs["messages"]
            assert len(sent_messages) == 8, f"Expected 8 messages, got {len(sent_messages)}"

            # Index 0: system
            assert sent_messages[0]["role"] == "system"
            # Index 1: user Turn 1
            assert sent_messages[1]["role"] == "user"
            assert sent_messages[1]["content"] == "Turn 1: Hello"
            # Index 2: assistant Turn 2
            assert sent_messages[2]["role"] == "assistant"
            assert sent_messages[2]["content"] == "Turn 2: Hi there!"
            # Index 3: user Turn 3
            assert sent_messages[3]["role"] == "user"
            assert sent_messages[3]["content"] == "Turn 3: Check my cash."
            # Index 4: assistant Turn 4
            assert sent_messages[4]["role"] == "assistant"
            assert sent_messages[4]["tool_calls"] == [{"id": "call_1", "type": "function", "function": {"name": "get_snapshot", "arguments": "{}"}}]
            # Index 5: tool Turn 5
            assert sent_messages[5]["role"] == "tool"
            assert sent_messages[5]["tool_call_id"] == "call_1"
            assert sent_messages[5]["content"] == '{"status":"ok"}'
            # Index 6: assistant Turn 6
            assert sent_messages[6]["role"] == "assistant"
            assert sent_messages[6]["tool_calls"] == [{"id": "call_2", "type": "function", "function": {"name": "get_schedule", "arguments": "{}"}}]
            # Index 7: tool Turn 7 (final turn)
            assert sent_messages[7]["role"] == "tool"
            assert sent_messages[7]["tool_call_id"] == "call_2"
            assert "--- LATEST LIVE SYSTEM STATE ---" in sent_messages[7]["content"]
            assert "Spending: $200" in sent_messages[7]["content"]
            assert '{"events":[]}' in sent_messages[7]["content"]

def test_empty_messages_payload(client, auth_headers):
    """
    STRESS TEST:
    Verify that an empty messages payload does not raise IndexError and forwards only system prompt.
    """
    payload = {
        "messages": [],
        "blueprint": {"accounts": []},
        "ledger_context": "Ledger context",
        "chat_mode": "tactical"
    }

    mock_chunk = MagicMock()
    mock_chunk.choices = []

    async def mock_stream(*args, **kwargs):
        yield mock_chunk

    with patch("app.api.routes_chat.configure_provider", return_value="mock-model"):
        with patch("app.api.routes_chat.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
            mock_acompletion.return_value = mock_stream()

            response = client.post("/api/chat", json=payload, headers=auth_headers)
            assert response.status_code == 200

            sent_messages = mock_acompletion.call_args.kwargs["messages"]
            assert len(sent_messages) == 1
            assert sent_messages[0]["role"] == "system"

