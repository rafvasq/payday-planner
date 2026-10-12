import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any
import logging
import litellm
from app.core.llm import configure_provider
from app.api.tools_schema import export_tools

logger = logging.getLogger("payday.chat")
router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    content: str | None = None
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    blueprint: dict[str, Any]
    ledger_context: str
    spending_summary: str | None = None
    provider: str | None = None
    chat_mode: str = 'tactical'
    tools: list[dict[str, Any]] | None = None

@router.post("/chat")
async def chat_stream(req: Request, payload: ChatRequest):
    last_msg = payload.messages[-1] if payload.messages else None
    logger.info(f"--- AI Chat Request Started ({payload.chat_mode} mode) ---")
    if last_msg and last_msg.role == 'user':
        logger.info(f"User Input: {last_msg.content}")
    elif last_msg and last_msg.role == 'tool':
        logger.info(f"Tool Result Input ({last_msg.name}): {last_msg.content}")
    else:
        logger.info(f"Input Role: {last_msg.role if last_msg else 'None'}")
    
    if payload.chat_mode == 'auditor':
        system_prompt = """You are Payday Planner's AI Strategic Auditor.
You are conducting a monthly budget retrospective.
Your job is to analyze the user's uploaded actual spending (CSV aggregates) against their JSON Blueprint targets (Baseline).
All variances, totals, and deltas have been precisely pre-calculated by the local engine and are provided to you in the LATEST LIVE SYSTEM STATE.
DO NOT ATTEMPT TO DO ANY MATH yourself. Rely exclusively on the provided pre-calculated variances.

Your objectives:
1. Identify behavioral trends (e.g., consistent overspending in a category).
2. Propose actionable adjustments to the JSON Blueprint (e.g., increasing a fixed cost allocation, or reducing a guilt-free buffer) using the `propose_blueprint_changes` tool.
3. Be concise, strategic, and focused on long-term behavioral changes.

Never expose internal system IDs to the user.
Answer their questions concisely based on this data."""
    else:
        system_prompt = """You are Payday Planner's AI financial controller and strategic advisor.
You operate strictly under the Household Financial Manifesto and the deterministic rules of the projection engine.

=== THE HOUSEHOLD FINANCIAL MANIFESTO ===
1. The Mission: Maintain $0 revolving debt, protect primary emergency reserves at all costs, and prioritize long-term savings trajectories without compromising operational cash solvency.
2. The Hierarchy of Accounts:
   - Inflow Channels (Personal Chequing): Dedicated landing strips for payroll, personal income, and direct personal obligations. Target floors on individual operating accounts are treated psychologically as ABSOLUTE ZERO. If a chequing account hits its floor, it is effectively dry until the next income event.
   - Operating Hub (Joint Clearinghouse): The primary transit hub for joint living expenses, housing costs, utilities, and tax obligations. Target floors on the hub account exist specifically to absorb real-world friction (multi-day banking transit, weekend clearing delays). Temporary dips below the target floor during multi-day transit are acceptable, but ending a settled cycle below the target floor or any dip below $0.00 is an immediate critical failure.
   - Storage Vaults (High-Yield Savings / Sinking Funds): Capital sinks (Emergency, Milestone/Wedding, sinking funds). Capital flows IN. It never leaks back to daily operations unless executing an authorized milestone payout or explicit emergency transfer.
3. The Variance Protocol:
   - When large expenses, unexpected debt spikes, or liquidity pinches threaten cash solvency (< $0) or violate settled floors, NEVER drain primary emergency reserves and NEVER carry revolving card debt.
   - INTERCEPT THE SAVINGS ENGINE: Immediately pause, reduce, or skip upcoming discretionary savings sweeps/vault transfers for that specific cycle to absorb the impact in the operating hub. Automated savings sweeps resume the following cycle once liquidity stabilizes.

=== CORE ENGINE ASSUMPTIONS ===
- The engine automatically handles clearing days, weekend shifts, and calendar bounds.
- Credit card interest and statement timing are not modeled. Cards are plain balances. You must not claim interest savings or invent due dates.
- An account dropping below $0.00 is a critical overdraft, NEVER a "floor calibration issue". You are strictly forbidden from proposing to lower an account's target floor to paper over a deficit.

=== PRECISION & PRESENTATION MANDATES ===
- Ruthless Precision Mandate: When quoting balances, debts, or transfer amounts, you MUST use the exact dollar-and-cent figures provided in the live ledger or tool outputs. Never round, estimate, or abbreviate (e.g., write $4,505.32, never $4,500 or 4.5k). Derived in-head math is strictly forbidden.
- Natural Language Mandate: Never expose internal system IDs to the user (e.g., use the natural account and event names from the blueprint, never internal IDs like 'e8' or 'id: hub').

=== TOOL EXECUTION RULES ===
- Zero-Trust Math: You are mathematically blind. Derived in-head math is strictly forbidden.
  * To inspect live account balances, target floors, headroom, and the 30-day outlook, you MUST call `get_snapshot`.
  * To check upcoming cash moves, scheduled bills, paydays, or calendar events between dates, you MUST call `get_schedule`.
  * You are strictly forbidden from running empty simulations like `simulate` with `{"changes": []}` to read state; use `get_snapshot` or `get_schedule` instead.
  * To test hypothetical plan changes, run the `simulate` tool (which requires a label and at least one non-empty change) and inspect the returned outlook before presenting solutions or calling `propose_blueprint_changes`. Do NOT call `simulate` and `propose_blueprint_changes` in the same turn.
  * When the user reports that a past transaction already occurred (e.g. transfer executed, bill paid, check deposited), invoke `record_actual` to present the interactive choice card. Ends your turn.
  * When a previous `propose_blueprint_changes` tool call has `user_decision: APPLIED_TO_PLAN`, the user has approved and committed those changes into the plan. Never claim they were not applied.
- Autonomous Interception: If a baseline projection results in an overdraft (< $0) or post-transit floor breach, do not throw your hands up. Execute a `simulate` call testing the Variance Protocol: use `skip_event` on upcoming discretionary savings sweeps/vault allocations to restore hub liquidity.
- Strict Verbs: To stop a recurring transfer for one cycle, use `skip_event`. Do not use `set_amount` to $0.
- Decisive Proposals & Dialogue:
  * If the path is unambiguous (e.g., standard Variance Protocol execution to prevent an overdraft), explain the trade-offs step-by-step in prose and call `propose_blueprint_changes` in the subsequent turn.
  * If valid strategic trade-offs exist (e.g., choosing which savings vault to pause vs. making a partial credit card payment), clearly lay out the numbered options with their exact simulated numbers and ask for the user's strategic intent before staging changes.

Answer their questions concisely based on this data."""
    
    # Prepend the system prompt to the message history
    messages = [{"role": "system", "content": system_prompt}]
    for i, msg in enumerate(payload.messages):
        msg_dict = {"role": msg.role, "content": msg.content or ""}
        if msg.name:
            msg_dict["name"] = msg.name
        if msg.tool_call_id:
            msg_dict["tool_call_id"] = msg.tool_call_id
        if msg.tool_calls:
            msg_dict["tool_calls"] = msg.tool_calls
            
        if i == len(payload.messages) - 1:
            blueprint_json = json.dumps(payload.blueprint, indent=2)
            msg_dict["content"] += (
                f"\n\n--- LATEST LIVE SYSTEM STATE ---\n"
                f"Blueprint:\n{blueprint_json}\n\n"
                f"Ledger:\n{payload.ledger_context}\n"
            )
            if payload.spending_summary:
                msg_dict["content"] += f"\nSpending Summary:\n{payload.spending_summary}\n"
                
        messages.append(msg_dict)

    async def event_generator():
        try:
            model_name = configure_provider(override_id=payload.provider)
        except Exception as e:
            msg = str(e)
            if "Connection error" in msg or "ConnectionRefused" in msg:
                yield f"data: [ERROR: Cannot reach {payload.provider or 'Ollama'}. Is the app running? Go to Settings.]\n\n"
            else:
                yield f"data: [ERROR: {msg}]\n\n"
            yield "data: [DONE]\n\n"
            return
        tools_to_use = payload.tools or export_tools
        try:
            response = await litellm.acompletion(
                model=model_name,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
                tools=tools_to_use
            )
            tool_calls_buffer = {}
            full_response_content = ""
            last_chunk = None
            
            async for chunk in response:
                last_chunk = chunk
                # Zombie Thread / Disconnect Check
                if await req.is_disconnected():
                    # Client dropped connection; abort the LiteLLM stream immediately
                    logger.warning("Client disconnected during stream")
                    break
                
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if hasattr(delta, "tool_calls") and delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_buffer:
                            tool_calls_buffer[idx] = {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": ""}}
                        if tc.function.arguments:
                            tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                content = getattr(delta, "content", None)
                if content:
                    full_response_content += content
                    yield f"data: {json.dumps(content)}\n\n"
            
            
            if last_chunk is not None and hasattr(last_chunk, "usage") and last_chunk.usage:
                usage_data = {'type': 'usage', 'prompt_tokens': last_chunk.usage.prompt_tokens, 'completion_tokens': last_chunk.usage.completion_tokens, 'total_tokens': last_chunk.usage.total_tokens, 'model': model_name}
                try:
                    from litellm import completion_cost
                    cost = completion_cost(model=model_name, prompt_tokens=last_chunk.usage.prompt_tokens, completion_tokens=last_chunk.usage.completion_tokens)
                    if cost is not None:
                        usage_data['estimated_cost_usd'] = cost
                except Exception as e:
                    pass
                yield f"data: {json.dumps(usage_data)}\n\n"

            if full_response_content:
                logger.info(f"AI Output: {full_response_content}")
            
            if tool_calls_buffer:
                for tc in tool_calls_buffer.values():
                    logger.info(f"AI Tool Call: {tc['function']['name']} args: {tc['function']['arguments']}")
                    yield f"data: {json.dumps({'type': 'tool_call', 'tool_call': tc})}\n\n"
                    
        except Exception as e:
            msg = str(e)
            if "Connection error" in msg or "ConnectionRefused" in msg or "APIConnectionError" in msg or "ConnectError" in msg:
                yield f"data: [ERROR: Cannot reach {payload.provider or 'Ollama'}. Is the app running? Go to Settings.]\n\n"
            else:
                yield f"data: [ERROR: {msg}]\n\n"
            
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
