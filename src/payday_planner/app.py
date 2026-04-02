# payday.py — Payday UI
# Stack: Python + Streamlit + Ollama (local AI) + pandas

import streamlit as st
import uuid
import os
from dataclasses import asdict
from datetime import date, timedelta
from typing import Optional
from itertools import groupby
import pandas as pd

from payday_planner.models import Member, Account, Event
from payday_planner.engine import (
    blueprint_to_json, json_to_blueprint,
    _default_accounts, _default_events, _default_rules, _default_goals,
    build_calendar,
    _monthly_rate, guilt_free_buffers,
)

def _blueprint_path() -> str:
    """Return the path to the user's blueprint file.

    Override with the PAYDAY_BLUEPRINT environment variable, otherwise uses
    the platform-appropriate user data directory (~/.local/share/payday/ on
    Linux, ~/Library/Application Support/payday/ on macOS).
    """
    custom = os.environ.get("PAYDAY_BLUEPRINT")
    if custom:
        return custom
    from platformdirs import user_data_dir
    return os.path.join(user_data_dir("payday", appauthor=False), "blueprint.json")


st.set_page_config(
    page_title="Payday",
    page_icon="💸",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── SESSION STATE ────────────────────────────────────────────────────────────

def _apply_blueprint(loaded: dict):
    """Write a loaded blueprint dict into session state."""
    st.session_state.members  = loaded["members"]
    st.session_state.accounts = loaded["accounts"]
    st.session_state.events   = loaded["events"]
    st.session_state.rules    = loaded["rules"]
    st.session_state.goals    = loaded["goals"]


def init_state():
    if "initialized" not in st.session_state:
        st.session_state.initialized         = True
        st.session_state.members             = [Member("A", "Person A", "#4A90D9"), Member("B", "Person B", "#E91E8C")]
        st.session_state.accounts            = _default_accounts()
        st.session_state.events              = _default_events()
        st.session_state.rules               = _default_rules()
        st.session_state.goals               = _default_goals()
        st.session_state.oracle_msgs         = []
        st.session_state.oracle_backend      = "Gemini"
        st.session_state.oracle_model        = "qwen2.5:7b"
        st.session_state.oracle_gemini_model = "gemini-2.5-flash"
        st.session_state.oracle_gemini_key   = ""
        st.session_state.page                = "Dashboard"

        # Auto-load personal blueprint
        bp_path = _blueprint_path()
        if os.path.exists(bp_path):
            try:
                with open(bp_path) as f:
                    _apply_blueprint(json_to_blueprint(f.read()))
            except Exception:
                pass  # fall back to defaults


# ─── UI HELPERS ───────────────────────────────────────────────────────────────

def get_account(acct_id: Optional[str]) -> Optional[Account]:
    if not acct_id:
        return None
    for a in st.session_state.accounts:
        if a.id == acct_id:
            return a
    return None


def account_name(acct_id: Optional[str]) -> str:
    a = get_account(acct_id)
    return a.name if a else "—"


def _account_selector(label: str, key: str, current_id: Optional[str] = None) -> Optional[str]:
    ids    = [""] + [a.id   for a in st.session_state.accounts]
    labels = ["— None —"] + [a.name for a in st.session_state.accounts]
    idx    = ids.index(current_id) if current_id in ids else 0
    chosen = st.selectbox(label, labels, index=idx, key=key)
    return ids[labels.index(chosen)] or None


def _render_cal_row(row: dict):
    t         = row["type"]
    from_name = account_name(row["from_account_id"])
    to_name   = account_name(row["to_account_id"])

    if t == "inflow":
        direction, color, sign = f"→ **{to_name}**", "green", "+"
    elif t == "outflow":
        direction, color, sign = f"from **{from_name}**", "red", "−"
    else:
        direction, color, sign = f"**{from_name}** → **{to_name}**", "blue", "→"

    tags_str = " ".join(f"`{tag}`" for tag in (row.get("tags") or []))
    st.markdown(
        f":{color}[{sign} ${row['amount']:,.0f}]&nbsp; {row['name']} "
        f"&nbsp; {direction} &nbsp; {tags_str} &nbsp; `[{row['owner']}]`"
    )


# ─── PAGE: DASHBOARD ──────────────────────────────────────────────────────────

def page_dashboard():
    st.header("Dashboard")

    accounts   = st.session_state.accounts
    liquid     = sum(a.balance for a in accounts if a.type in ("chequing", "savings", "investment"))
    re_equity  = sum(a.market_value - a.balance for a in accounts if a.type == "liability" and a.market_value > 0)
    naked_liab = sum(a.balance for a in accounts if a.type == "liability" and a.market_value == 0)
    debt       = sum(a.balance for a in accounts if a.type == "debt")
    net_worth  = liquid + re_equity - naked_liab - debt

    st.caption("NET WORTH")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Net Worth",          f"${net_worth:,.0f}")
    c2.metric("Liquid Assets",      f"${liquid:,.0f}")
    c3.metric("Real Estate Equity", f"${re_equity:,.0f}", help="Market value minus outstanding mortgage balance")
    c4.metric("Total Debt",         f"${debt:,.0f}",      help="Lines of credit, credit cards, etc.")

    st.divider()

    # Biweekly cashflow summary
    events = st.session_state.events
    bw = 12 / 26
    mo_in      = sum(e.amount * _monthly_rate(e.frequency) for e in events if e.active and e.event_type == "inflow")
    mo_to_hub  = sum(e.amount * _monthly_rate(e.frequency) for e in events if e.active and e.event_type == "transfer" and e.to_account_id == "hub")
    mo_bills   = sum(e.amount * _monthly_rate(e.frequency) for e in events if e.active and e.event_type == "outflow")
    mo_savings = sum(e.amount * _monthly_rate(e.frequency) for e in events if e.active and e.event_type == "transfer" and e.to_account_id != "hub")
    bw_in, bw_to_hub, bw_bills, bw_savings = mo_in * bw, mo_to_hub * bw, mo_bills * bw, mo_savings * bw
    st.caption("BIWEEKLY CASHFLOW")
    bw1, bw2, bw3, bw4 = st.columns(4)
    bw1.metric("Combined Inflow",   f"${bw_in:,.0f}",      help="All recurring inflows per payday cycle")
    bw2.metric("→ Hub",             f"${bw_to_hub:,.0f}",  help="Transfers into the joint hub per payday cycle")
    bw3.metric("Bills & Mortgages", f"${bw_bills:,.0f}",   help="Fixed outflows (mortgages, condo fees, etc.) per payday cycle")
    bw4.metric("→ Savings & Debt",  f"${bw_savings:,.0f}", help="Transfers to savings accounts and debt repayment per payday cycle")
    bw1.caption(f"${mo_in:,.0f} / mo")
    bw2.caption(f"${mo_to_hub:,.0f} / mo")
    bw3.caption(f"${mo_bills:,.0f} / mo")
    bw4.caption(f"${mo_savings:,.0f} / mo")

    st.divider()

    # Guilt-free buffers
    buffers = guilt_free_buffers(accounts, st.session_state.events)
    if buffers:
        st.caption("GUILT-FREE BUFFERS")
        members_by_id = {m.id: m for m in st.session_state.members}
        buf_cols = st.columns(len(buffers))
        for i, (owner_id, (avg_monthly, safe_biweekly)) in enumerate(sorted(buffers.items())):
            member = members_by_id.get(owner_id)
            name   = member.name if member else owner_id
            buf_cols[i].metric(
                f"{name} — Safe Buffer",
                f"${safe_biweekly:,.0f} / payday",
                help="Worst-case payday buffer: biweekly inflows minus all committed outflows, with monthly bills counted in full. No phantom money from uncollected fees.",
            )
            buf_cols[i].caption(f"avg ${avg_monthly * 12 / 26:,.0f} / payday  ·  ${avg_monthly:,.0f} / mo")

    st.divider()

    # Goals
    st.caption("GOALS")
    for goal in st.session_state.goals:
        acct = get_account(goal.account_id)
        if not acct:
            continue
        current   = acct.balance
        target    = goal.target_balance
        days_left = (date.fromisoformat(goal.target_date) - date.today()).days

        if target == 0:
            progress   = 0.0
            stats_text = f"${current:,.0f} → $0  ·  {days_left}d left"
        else:
            progress   = min(current / target, 1.0)
            stats_text = f"${current:,.0f} / ${target:,.0f}  ·  {int(progress * 100)}%  ·  {days_left}d left"

        gl, gr = st.columns([3, 2])
        gl.markdown(f"**{goal.name}**")
        gr.markdown(f"<p style='text-align:right;font-size:0.85em;color:#8B90A0;margin:0'>{stats_text}</p>", unsafe_allow_html=True)
        st.progress(progress)
        if goal.notes:
            st.caption(goal.notes)

    st.divider()

    # Account balances
    st.subheader("Account Balances")
    for acct_type, label in ACCT_TYPE_LABELS.items():
        typed = [a for a in accounts if a.type == acct_type]
        if not typed:
            continue
        st.caption(label.upper())
        cols = st.columns(4)
        for i, acct in enumerate(typed):
            cols[i % 4].metric(f"{acct.name}", f"${acct.balance:,.2f}", help=f"Owner: {acct.owner}")

    st.divider()

    # Next 14-day preview
    st.subheader("Next 14 Days — Checklist")
    today = date.today()
    cal = build_calendar(st.session_state.events, today, today + timedelta(days=14))
    for dt, grp in groupby(cal, key=lambda x: x["date"]):
        items     = list(grp)
        is_payday = any("income" in (r.get("tags") or []) for r in items)
        with st.expander(dt.strftime("%a %b %d") + (" 💰" if is_payday else ""), expanded=is_payday):
            for row in items:
                _render_cal_row(row)


# ─── PAGE: ACCOUNTS ───────────────────────────────────────────────────────────

ACCOUNT_TYPES    = ["chequing", "savings", "debt", "investment", "liability"]
OWNERS           = ["A", "B", "Joint"]
ACCT_TYPE_LABELS = {
    "chequing": "Chequing", "savings": "Savings",
    "investment": "Investments", "debt": "Debt", "liability": "Liabilities",
}
ACCT_TYPE_COLOR = {
    "chequing":   "#4078F2",
    "savings":    "#50A14F",
    "investment": "#986801",
    "debt":       "#E45649",
    "liability":  "#A626A4",
}


def page_accounts():
    st.header("Accounts")

    # Members
    st.caption("MEMBERS")
    for i, m in enumerate(st.session_state.members):
        with st.expander(f"{m.name}  ·  {m.id}", expanded=False):
            with st.form(f"member_{m.id}"):
                c1, c2 = st.columns(2)
                new_name  = c1.text_input("Name",  value=m.name)
                new_color = c2.color_picker("Color", value=m.color)
                if st.form_submit_button("Save"):
                    st.session_state.members[i].name  = new_name
                    st.session_state.members[i].color = new_color
                    st.rerun()

    st.divider()

    with st.expander("+ Add Account", expanded=False):
        with st.form("add_account"):
            c1, c2, c3 = st.columns(3)
            name      = c1.text_input("Name")
            acct_type = c2.selectbox("Type",  ACCOUNT_TYPES)
            owner     = c3.selectbox("Owner", OWNERS)
            c4, c5, c6, c7 = st.columns(4)
            balance      = c4.number_input("Balance",         value=0.0, step=100.0)
            rate         = c5.number_input("Interest Rate %", value=0.0, step=0.1, min_value=0.0)
            market_value = c6.number_input("Market Value",    value=0.0, step=1000.0, help="Liabilities only: estimated sale value of the property")
            notes        = c7.text_input("Notes")
            if st.form_submit_button("Add") and name:
                new_id = name.lower().replace(" ", "_") + "_" + str(uuid.uuid4())[:4]
                st.session_state.accounts.append(Account(new_id, name, acct_type, owner, balance, rate, notes, market_value))
                st.rerun()

    st.divider()

    for i, acct in enumerate(st.session_state.accounts):
        with st.expander(f"{acct.name}  ·  {acct.owner}  ·  ${acct.balance:,.2f}"):
            with st.form(f"acct_{acct.id}"):
                c1, c2, c3 = st.columns(3)
                name      = c1.text_input("Name",  value=acct.name)
                acct_type = c2.selectbox("Type",   ACCOUNT_TYPES, index=ACCOUNT_TYPES.index(acct.type))
                owner     = c3.selectbox("Owner",  OWNERS,        index=OWNERS.index(acct.owner))
                c4, c5, c6, c7 = st.columns(4)
                balance      = c4.number_input("Balance",         value=float(acct.balance),       step=100.0)
                rate         = c5.number_input("Interest Rate %", value=float(acct.interest_rate), step=0.1)
                market_value = c6.number_input("Market Value",    value=float(acct.market_value),  step=1000.0, help="Liabilities only: estimated sale value of the property")
                notes        = c7.text_input("Notes", value=acct.notes)
                sv, dl = st.columns([4, 1])
                if sv.form_submit_button("Save"):
                    a = st.session_state.accounts[i]
                    a.name, a.type, a.owner = name, acct_type, owner
                    a.balance, a.interest_rate, a.notes = balance, rate, notes
                    a.market_value = market_value
                    st.rerun()
                if dl.form_submit_button("Delete"):
                    st.session_state.accounts.pop(i)
                    st.rerun()


# ─── PAGE: EVENTS ─────────────────────────────────────────────────────────────

FREQUENCIES  = ["one-time", "weekly", "biweekly", "biweekly-offset", "monthly", "quarterly"]
EVENT_TYPES  = ["inflow", "outflow", "transfer"]
AMOUNT_TYPES = ["fixed", "percentage", "remainder"]
TIERS        = [1, 2, 3, 4, 5]
TIER_LABELS  = {
    1: "1 — Income",
    2: "2 — Personal Bills",
    3: "3 — Hub Transfers",
    4: "4 — Joint Expenses & Savings",
    5: "5 — Debt Payoff & Goals",
}


def _event_fields(prefix: str, ev: Optional[Event] = None) -> dict:
    c1, c2, c3 = st.columns(3)
    name       = c1.text_input("Name",  value=ev.name if ev else "")
    event_type = c2.selectbox("Type",   EVENT_TYPES, index=EVENT_TYPES.index(ev.event_type) if ev else 0)
    owner      = c3.selectbox("Owner",  OWNERS,      index=OWNERS.index(ev.owner) if ev else 0)
    c4, c5, c6 = st.columns(3)
    amount_type = c4.selectbox("Amount Type", AMOUNT_TYPES, index=AMOUNT_TYPES.index(ev.amount_type) if ev else 0)
    amount      = c5.number_input("Amount", value=float(ev.amount) if ev else 0.0, step=10.0)
    tier        = c6.selectbox("Tier", TIERS, index=TIERS.index(ev.tier) if ev else 0,
                               format_func=lambda t: TIER_LABELS[t])
    c7, c8 = st.columns(2)
    with c7:
        from_id = _account_selector("From Account", f"{prefix}_from", ev.from_account_id if ev else None)
    with c8:
        to_id = _account_selector("To Account", f"{prefix}_to", ev.to_account_id if ev else None)
    c9, c10, c11, c12 = st.columns(4)
    frequency = c9.selectbox("Frequency",   FREQUENCIES, index=FREQUENCIES.index(ev.frequency) if ev else 0)
    anchor    = c10.date_input("Anchor Date", value=date.fromisoformat(ev.anchor_date) if ev else date.today())
    has_end   = c11.checkbox("Has End Date?", value=bool(ev.end_date) if ev else False)
    end_val   = c12.date_input("End Date",
                                value=date.fromisoformat(ev.end_date) if (ev and ev.end_date) else date.today())
    tags_raw  = st.text_input("Tags (comma-separated)", value=", ".join(ev.tags) if ev else "")
    notes     = st.text_input("Notes", value=ev.notes if ev else "")
    active    = st.checkbox("Active", value=ev.active if ev else True) if ev else True
    return dict(name=name, event_type=event_type, owner=owner, amount_type=amount_type,
                amount=amount, tier=tier, from_id=from_id, to_id=to_id,
                frequency=frequency, anchor=anchor, has_end=has_end, end_val=end_val,
                tags_raw=tags_raw, notes=notes, active=active)


def page_events():
    st.header("Events")

    with st.expander("+ Add Event", expanded=False):
        with st.form("add_event"):
            f = _event_fields("add")
            if st.form_submit_button("Add Event") and f["name"]:
                st.session_state.events.append(Event(
                    id=str(uuid.uuid4()), name=f["name"], event_type=f["event_type"],
                    amount=f["amount"], amount_type=f["amount_type"],
                    from_account_id=f["from_id"], to_account_id=f["to_id"],
                    frequency=f["frequency"], anchor_date=f["anchor"].isoformat(),
                    end_date=f["end_val"].isoformat() if f["has_end"] else None,
                    owner=f["owner"], tier=f["tier"],
                    tags=[t.strip() for t in f["tags_raw"].split(",") if t.strip()],
                    notes=f["notes"],
                ))
                st.rerun()

    st.divider()

    fc1, fc2, fc3 = st.columns(3)
    f_owner  = fc1.multiselect("Owner",  OWNERS,      default=OWNERS)
    f_type   = fc2.multiselect("Type",   EVENT_TYPES, default=EVENT_TYPES)
    f_status = fc3.radio("Status", ["All", "Active", "Inactive"], horizontal=True)

    shown = [
        e for e in st.session_state.events
        if e.owner in f_owner
        and e.event_type in f_type
        and (f_status == "All" or (f_status == "Active") == e.active)
    ]

    for event in shown:
        real_idx = st.session_state.events.index(event)
        end_str  = f" → {event.end_date}" if event.end_date else ""
        flag     = "✓" if event.active else "✗"
        label    = f"{flag} [{event.owner}] {event.name}  ·  ${event.amount:,.0f}  ·  {event.frequency}{end_str}"

        with st.expander(label):
            with st.form(f"evt_{event.id}"):
                f = _event_fields(event.id, event)
                sv, dl = st.columns([4, 1])
                if sv.form_submit_button("Save"):
                    e = st.session_state.events[real_idx]
                    e.name, e.event_type, e.owner = f["name"], f["event_type"], f["owner"]
                    e.amount_type, e.amount, e.tier = f["amount_type"], f["amount"], f["tier"]
                    e.from_account_id, e.to_account_id = f["from_id"], f["to_id"]
                    e.frequency   = f["frequency"]
                    e.anchor_date = f["anchor"].isoformat()
                    e.end_date    = f["end_val"].isoformat() if f["has_end"] else None
                    e.tags        = [t.strip() for t in f["tags_raw"].split(",") if t.strip()]
                    e.notes, e.active = f["notes"], f["active"]
                    st.rerun()
                if dl.form_submit_button("Delete"):
                    st.session_state.events.pop(real_idx)
                    st.rerun()


# ─── PAGE: TIMELINE ───────────────────────────────────────────────────────────

def page_timeline():
    st.header("Timeline")

    c1, c2, c3 = st.columns(3)
    start        = c1.date_input("From", value=date.today())
    end          = c2.date_input("To",   value=date.today() + timedelta(days=56))
    filter_owner = c3.multiselect("Owner", OWNERS, default=OWNERS)

    if start > end:
        st.error("Start date must be before end date.")
        return

    cal = [r for r in build_calendar(st.session_state.events, start, end)
           if r["owner"] in filter_owner]

    if not cal:
        st.info("No events in this range.")
        return

    for dt, grp in groupby(cal, key=lambda x: x["date"]):
        items     = list(grp)
        is_payday = any("income" in (r.get("tags") or []) for r in items)
        with st.expander(dt.strftime("%a %b %d") + (" 💰" if is_payday else ""), expanded=is_payday):
            for row in items:
                _render_cal_row(row)


# ─── PAGE: FLOW DIAGRAM ───────────────────────────────────────────────────────

def _build_mermaid() -> str:
    events   = [e for e in st.session_state.events if e.active]
    acct_map = {a.id: a for a in st.session_state.accounts}
    lines    = ["graph LR"]
    added    = set()

    def _safe(s: str) -> str:
        return s.replace("-", "_").replace(" ", "_")

    for e in events:
        for aid in [e.from_account_id, e.to_account_id]:
            if aid and aid not in added:
                a = acct_map.get(aid)
                if a:
                    lines.append(f'  {_safe(aid)}["{a.name}"]')
                    added.add(aid)

    for e in events:
        if e.event_type == "inflow" and not e.from_account_id:
            node_id = "ext_in_" + _safe(e.id)
            lines.append(f'  {node_id}(("{e.name}"))')
            added.add(node_id)
        elif e.event_type == "outflow" and not e.to_account_id:
            node_id = "ext_out_" + _safe(e.id)
            lines.append(f'  {node_id}(("{e.name}"))')
            added.add(node_id)

    lines.append("")

    for e in events:
        if e.event_type == "inflow" and not e.from_account_id and e.to_account_id:
            src = "ext_in_" + _safe(e.id)
            dst = _safe(e.to_account_id)
            lines.append(f'  {src} -->|"${e.amount:,.0f}"| {dst}')
        elif e.event_type == "outflow" and not e.to_account_id and e.from_account_id:
            src = "ext_out_" + _safe(e.id)
            dst = _safe(e.from_account_id)
            lines.append(f'  {dst} -->|"${e.amount:,.0f}"| {src}')
        elif e.from_account_id and e.to_account_id:
            src = _safe(e.from_account_id)
            dst = _safe(e.to_account_id)
            lines.append(f'  {src} -->|"${e.amount:,.0f}"| {dst}')

    return "\n".join(lines)


def page_flow_diagram():
    st.header("Flow Diagram")

    mermaid = _build_mermaid()

    st.subheader("Mermaid Source")
    st.caption("Copy and paste into mermaid.live to render interactively.")
    st.code(mermaid, language="text")

    st.divider()
    st.subheader("Live Preview")
    html = f"""
    <div class="mermaid" style="background:#fff;padding:1rem;border-radius:8px;">{mermaid}</div>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({{startOnLoad:true,theme:'default'}});</script>
    """
    st.components.v1.html(html, height=640, scrolling=True)


# ─── PAGE: ORACLE ─────────────────────────────────────────────────────────────

def extract_blueprint_json(content: str) -> Optional[str]:
    """Return the first ```json ... ``` block from an Oracle response, or None."""
    if "```json" not in content:
        return None
    try:
        return content.split("```json")[1].split("```")[0].strip()
    except IndexError:
        return None


_ORACLE_SYSTEM = """\
You are the Payday Oracle, a personal finance assistant embedded in a money-flow planning app.
You have the user's complete financial setup in JSON (accounts, events, rules, goals).

Your responsibilities:
1. Answer questions about their money flow clearly and concisely.
2. Generate payday checklists on demand using exact account names and amounts.
3. When asked to update the setup, output a COMPLETE updated blueprint in the same JSON schema, wrapped in ```json ... ``` code blocks.
4. Explain your reasoning briefly.

When writing blueprint updates:
- ALWAYS copy the existing blueprint exactly and apply only the requested change — do not invent, rename, or remove anything else.
- Account IDs must match exactly (e.g. "hub", "chq_a", "sav2") — never substitute account names for IDs.
- Every Event must include all fields: id, name, event_type, amount, amount_type, from_account_id, to_account_id, frequency, anchor_date, end_date, owner, tier, tags, notes, active.
- Use a new uuid-style string for any new Event or Rule id (e.g. "a1b2c3d4-..."). Never reuse an existing id.
- Valid frequencies: one-time, weekly, biweekly, biweekly-offset, monthly, quarterly.
- anchor_date and end_date must be ISO format (YYYY-MM-DD). Use null for end_date if not applicable.

Current setup:
{blueprint}
"""

GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]


def _call_oracle(backend: str, system: str, messages: list,
                 ollama_model: str = "", gemini_model: str = "", gemini_key: str = "") -> str:
    if backend == "Ollama":
        import ollama as _ollama
        response = _ollama.chat(
            model=ollama_model,
            messages=[{"role": "system", "content": system}, *messages],
        )
        return response.message.content
    else:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        history = [
            {"role": "model" if m["role"] == "assistant" else "user",
             "parts": [m["content"]]}
            for m in messages[:-1]
        ]
        model    = genai.GenerativeModel(model_name=gemini_model, system_instruction=system)
        chat     = model.start_chat(history=history)
        response = chat.send_message(messages[-1]["content"])
        return response.text


def page_oracle():
    st.header("Oracle")

    if st.button("Clear conversation"):
        st.session_state.oracle_msgs = []
        st.rerun()

    if st.session_state.oracle_msgs:
        last = st.session_state.oracle_msgs[-1]
        if last["role"] == "assistant" and "```json" in last["content"]:
            try:
                raw = extract_blueprint_json(last["content"])
                if raw is None:
                    raise ValueError("No JSON block found in response")
                with st.expander("Blueprint update detected — preview & apply", expanded=True):
                    st.json(raw)
                    if st.button("Apply Update", type="primary"):
                        _apply_blueprint(json_to_blueprint(raw))
                        st.success("Blueprint updated.")
                        st.rerun()
            except Exception as ex:
                st.warning(f"Could not parse blueprint update: {ex}")

    for msg in st.session_state.oracle_msgs:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    user_input = st.chat_input(
        "Ask the Oracle — e.g. 'Add a $150/month Car Fund transfer from Hub to Goals'"
    )
    if user_input:
        with st.chat_message("user"):
            st.markdown(user_input)
        st.session_state.oracle_msgs.append({"role": "user", "content": user_input})

        blueprint = blueprint_to_json(st.session_state)
        system    = _ORACLE_SYSTEM.format(blueprint=blueprint)
        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                try:
                    reply = _call_oracle(
                        backend      = st.session_state.oracle_backend,
                        system       = system,
                        messages     = st.session_state.oracle_msgs,
                        ollama_model = st.session_state.oracle_model,
                        gemini_model = st.session_state.oracle_gemini_model,
                        gemini_key   = st.session_state.oracle_gemini_key,
                    )
                except Exception as ex:
                    reply = f"**Error:** {ex}"
            st.markdown(reply)
        st.session_state.oracle_msgs.append({"role": "assistant", "content": reply})
        st.rerun()


# ─── PAGE: EXPORT / IMPORT ────────────────────────────────────────────────────

def page_export():
    st.header("Export & Import")

    st.subheader("JSON Blueprint")
    st.caption("Complete export — import this file to restore everything exactly.")
    blueprint = blueprint_to_json(st.session_state)
    st.text_area("Blueprint JSON", value=blueprint, height=260)
    st.download_button("Download blueprint.json", data=blueprint,
                       file_name="payday_blueprint.json", mime="application/json")

    st.divider()

    st.subheader("Import Blueprint")
    uploaded = st.file_uploader("Upload blueprint.json", type="json")
    pasted   = st.text_area("Or paste JSON here", height=120)
    if st.button("Import", type="primary"):
        try:
            raw = uploaded.read().decode() if uploaded else pasted
            _apply_blueprint(json_to_blueprint(raw))
            st.success("Imported successfully.")
            st.rerun()
        except Exception as ex:
            st.error(f"Import failed: {ex}")

    st.divider()

    st.subheader("CSV Export")
    c1, c2, c3 = st.columns(3)
    c1.download_button("accounts.csv",
                       data=pd.DataFrame([asdict(a) for a in st.session_state.accounts]).to_csv(index=False),
                       file_name="accounts.csv", mime="text/csv")
    c2.download_button("events.csv",
                       data=pd.DataFrame([asdict(e) for e in st.session_state.events]).to_csv(index=False),
                       file_name="events.csv", mime="text/csv")
    c3.download_button("goals.csv",
                       data=pd.DataFrame([asdict(g) for g in st.session_state.goals]).to_csv(index=False),
                       file_name="goals.csv", mime="text/csv")

    st.divider()

    st.subheader("Mermaid Diagram")
    mermaid = _build_mermaid()
    st.download_button("Download diagram.md", data=mermaid,
                       file_name="payday_diagram.md", mime="text/markdown")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

PAGES = {
    "Dashboard":    page_dashboard,
    "Accounts":     page_accounts,
    "Events":       page_events,
    "Timeline":     page_timeline,
    "Flow Diagram": page_flow_diagram,
    "Oracle":       page_oracle,
    "Export":       page_export,
}

PAGE_ICONS = {
    "Dashboard":    "📊",
    "Accounts":     "🏦",
    "Events":       "📅",
    "Timeline":     "🗓️",
    "Flow Diagram": "🔀",
    "Oracle":       "🔮",
    "Export":       "📤",
}

_APP_CSS = """
<style>
/* ── Atom One Light palette ──────────────────────────────────────────────────
   bg:       #FAFAFA   secondary: #F0F2F7
   text:     #383A42   muted:     #8B90A0
   blue:     #4078F2   green:     #50A14F
   red:      #E45649   orange:    #986801
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Sidebar shell ── */
section[data-testid="stSidebar"] {
    border-right: 1px solid #E5E8F0 !important;
    background: #F5F7FB !important;
}

/* ── Sidebar radio → nav items ── */
[data-testid="stSidebar"] [data-testid="stRadio"] > div {
    gap: 0 !important;
}
[data-testid="stSidebar"] [data-testid="stRadio"] label {
    padding: 0.45rem 0.75rem !important;
    border-radius: 7px !important;
    border-left: 3px solid transparent !important;
    margin: 1px 0 !important;
    font-size: 0.9rem !important;
    color: #383A42 !important;
    transition: background 0.12s !important;
}
[data-testid="stSidebar"] [data-testid="stRadio"] label:hover {
    background: rgba(64,120,242,0.07) !important;
}
[data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) {
    background: rgba(64,120,242,0.1) !important;
    border-left-color: #4078F2 !important;
}
[data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) p {
    font-weight: 600 !important;
    color: #4078F2 !important;
}
[data-testid="stSidebar"] [data-testid="stRadio"] label > div:first-child {
    display: none !important;
}
[data-testid="stSidebar"] [data-testid="stRadio"] label > div:last-child {
    width: 100% !important;
}

/* ── Metric cards ── */
[data-testid="metric-container"] {
    background: #FFFFFF;
    border: 1px solid #E5E8F0;
    border-radius: 12px;
    padding: 1rem 1.25rem !important;
    box-shadow: 0 1px 4px rgba(56,58,66,0.06);
}
[data-testid="stMetricValue"] > div {
    font-size: 1.75rem !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em !important;
    color: #383A42 !important;
}
[data-testid="stMetricLabel"] > div {
    font-size: 0.7rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.07em !important;
    color: #8B90A0 !important;
}

/* ── Progress bars ── */
[data-testid="stProgress"] > div > div > div > div {
    background: linear-gradient(90deg, #4078F2, #50A14F) !important;
    border-radius: 4px !important;
}

/* ── Primary buttons ── */
button[kind="primary"] {
    background: #4078F2 !important;
    border: none !important;
    font-weight: 600 !important;
    letter-spacing: 0.02em !important;
    box-shadow: 0 2px 8px rgba(64,120,242,0.3) !important;
    transition: box-shadow 0.15s, transform 0.15s !important;
}
button[kind="primary"]:hover {
    background: #2E63D8 !important;
    box-shadow: 0 4px 14px rgba(64,120,242,0.45) !important;
    transform: translateY(-1px) !important;
}

/* ── Tabs ── */
button[data-baseweb="tab"] {
    font-weight: 500 !important;
    color: #8B90A0 !important;
}
button[data-baseweb="tab"][aria-selected="true"] {
    font-weight: 700 !important;
    color: #383A42 !important;
}

/* ── Expanders ── */
details {
    border: 1px solid #E5E8F0 !important;
    border-radius: 10px !important;
    overflow: hidden !important;
    margin-bottom: 0.5rem !important;
    background: #FFFFFF !important;
}
details > summary {
    font-weight: 500 !important;
    padding: 0.6rem 1rem !important;
    color: #383A42 !important;
}

/* ── Dividers ── */
hr {
    border-color: #E5E8F0 !important;
    margin: 0.75rem 0 !important;
}

/* ── Inputs ── */
[data-testid="stTextInput"] input,
[data-testid="stNumberInput"] input,
textarea {
    border-color: #D8DCE8 !important;
    background: #FFFFFF !important;
}

/* ── Page headers ── */
[data-testid="stAppViewContainer"] h1 {
    font-weight: 800 !important;
    letter-spacing: -0.03em !important;
    color: #383A42 !important;
}

/* ── Chat messages ── */
[data-testid="stChatMessage"] {
    border: 1px solid #E5E8F0;
    border-radius: 12px;
    margin-bottom: 0.5rem;
    background: #FFFFFF;
}

/* ── Form submit buttons (Save / Add) ── */
[data-testid="stFormSubmitButton"] button {
    background: #383A42 !important;
    border: none !important;
    color: #FAFAFA !important;
    font-weight: 600 !important;
    letter-spacing: 0.02em !important;
    box-shadow: 0 1px 4px rgba(56,58,66,0.15) !important;
    transition: box-shadow 0.15s, transform 0.15s !important;
}
[data-testid="stFormSubmitButton"] button:hover {
    background: #23252B !important;
    box-shadow: 0 3px 10px rgba(56,58,66,0.25) !important;
    transform: translateY(-1px) !important;
}
</style>
"""


def main():
    init_state()
    st.markdown(_APP_CSS, unsafe_allow_html=True)

    with st.sidebar:
        st.markdown("### 💸 Payday")
        st.caption("Personal cashflow planner")
        st.divider()

        st.radio(
            "nav",
            list(PAGES.keys()),
            key="page",
            format_func=lambda x: f"{PAGE_ICONS[x]}  {x}",
            label_visibility="collapsed",
        )

        st.divider()

        accounts      = st.session_state.accounts
        active_events = len([e for e in st.session_state.events if e.active])
        liquid        = sum(a.balance for a in accounts if a.type in ("chequing", "savings", "investment"))
        re_equity     = sum(a.market_value - a.balance for a in accounts if a.type == "liability" and a.market_value > 0)
        naked_liab    = sum(a.balance for a in accounts if a.type == "liability" and a.market_value == 0)
        debt          = sum(a.balance for a in accounts if a.type == "debt")
        net_worth     = liquid + re_equity - naked_liab - debt
        st.markdown(
            f'<div style="background:#FFFFFF;border:1px solid #E5E8F0;border-radius:10px;padding:0.75rem 1rem;box-shadow:0 1px 4px rgba(56,58,66,0.06)">'
            f'<div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.07em;color:#8B90A0">Net Worth</div>'
            f'<div style="font-size:1.3rem;font-weight:700;margin:0.15rem 0;color:#383A42">${net_worth:,.0f}</div>'
            f'<div style="font-size:0.72rem;color:#8B90A0">{len(accounts)} accounts &nbsp;·&nbsp; {active_events} active events</div>'
            f'</div>',
            unsafe_allow_html=True,
        )

        st.divider()

        st.caption("Oracle")
        st.session_state.oracle_backend = st.selectbox(
            "Backend", ["Gemini", "Ollama"],
            index=["Gemini", "Ollama"].index(st.session_state.oracle_backend),
            label_visibility="collapsed",
        )

        if st.session_state.oracle_backend == "Gemini":
            st.session_state.oracle_gemini_key = st.text_input(
                "API key", value=st.session_state.oracle_gemini_key,
                type="password", placeholder="Gemini API key",
                label_visibility="collapsed",
            )
            current = st.session_state.oracle_gemini_model
            idx     = GEMINI_MODELS.index(current) if current in GEMINI_MODELS else 0
            st.session_state.oracle_gemini_model = st.selectbox(
                "Gemini model", GEMINI_MODELS, index=idx, label_visibility="collapsed"
            )
            st.caption("Get a free key at aistudio.google.com")
        else:
            try:
                import ollama as _ollama
                model_list = [m.model for m in _ollama.list().models]
            except Exception:
                model_list = []
            if model_list:
                current = st.session_state.oracle_model
                idx     = model_list.index(current) if current in model_list else 0
                st.session_state.oracle_model = st.selectbox(
                    "Ollama model", model_list, index=idx, label_visibility="collapsed"
                )
            else:
                st.session_state.oracle_model = st.text_input(
                    "Ollama model", value=st.session_state.oracle_model,
                    label_visibility="collapsed",
                )
                st.caption("`ollama pull qwen2.5:7b`")

    PAGES[st.session_state.page]()

    # Autosave
    try:
        bp_path = _blueprint_path()
        os.makedirs(os.path.dirname(bp_path), exist_ok=True)
        with open(bp_path, "w") as f:
            f.write(blueprint_to_json(st.session_state))
    except Exception:
        pass


if __name__ == "__main__":
    main()
