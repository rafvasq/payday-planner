# payday.py — Payday UI
# Stack: Python + Streamlit + pandas

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
    _default_accounts, _default_events,
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


def init_state():
    if "initialized" not in st.session_state:
        st.session_state.initialized         = True
        st.session_state.members             = [Member("A", "Person A"), Member("B", "Person B")]
        st.session_state.accounts            = _default_accounts()
        st.session_state.events              = _default_events()
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

    st.markdown(
        f":{color}[{sign} ${row['amount']:,.0f}]&nbsp; {row['name']} "
        f"&nbsp; {direction}"
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
        is_payday = any(r["type"] == "inflow" for r in items)
        with st.expander(dt.strftime("%a %b %d") + (" 💰" if is_payday else ""), expanded=is_payday):
            for row in items:
                _render_cal_row(row)


# ─── PAGE: ACCOUNTS ───────────────────────────────────────────────────────────

ACCOUNT_TYPES    = ["chequing", "savings", "debt", "investment", "liability"]
OWNERS           = ["A", "B", "Joint"]
SWEEP_ROLE_OPTIONS = ["— Unspecified —", "buffer", "restricted"]
RATE_BEARING_TYPES = {"savings", "investment", "liability"}  # chequing/debt: rate doesn't change the strategy
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


def _account_extra_fields(acct: Optional[Account] = None) -> dict:
    c1, c2, c3, c4 = st.columns(4)
    has_floor = c1.checkbox("Set Target Floor?", value=(acct.target_floor is not None) if acct else False)
    target_floor = c2.number_input(
        "Target Floor", value=float(acct.target_floor) if (acct and acct.target_floor is not None) else 0.0,
        step=50.0, help="Minimum balance to keep in this account")
    has_ceiling = c3.checkbox("Set Sweep Ceiling?", value=(acct.sweep_ceiling is not None) if acct else False)
    sweep_ceiling = c4.number_input(
        "Sweep Ceiling", value=float(acct.sweep_ceiling) if (acct and acct.sweep_ceiling is not None) else 0.0,
        step=100.0, help="Balance above which surplus is safe to sweep out")

    c5, c6, c7 = st.columns(3)
    role_idx = SWEEP_ROLE_OPTIONS.index(acct.sweep_role) if (acct and acct.sweep_role in SWEEP_ROLE_OPTIONS) else 0
    sweep_role = c5.selectbox("Sweep Role", SWEEP_ROLE_OPTIONS, index=role_idx,
                              help="buffer = ok to draw from in a pinch; restricted = never sweep")
    has_close = c6.checkbox("Set Statement Close Date?", value=bool(acct and acct.statement_close_date))
    close_date = c7.date_input(
        "Statement Close Date",
        value=date.fromisoformat(acct.statement_close_date) if (acct and acct.statement_close_date) else date.today(),
        help="Debt accounts only")

    c8, c9 = st.columns(2)
    has_due = c8.checkbox("Set Payment Due Date?", value=bool(acct and acct.payment_due_date))
    due_date = c9.date_input(
        "Payment Due Date",
        value=date.fromisoformat(acct.payment_due_date) if (acct and acct.payment_due_date) else date.today(),
        help="Debt accounts only")

    return dict(
        target_floor=target_floor if has_floor else None,
        sweep_ceiling=sweep_ceiling if has_ceiling else None,
        sweep_role=None if sweep_role == SWEEP_ROLE_OPTIONS[0] else sweep_role,
        statement_close_date=close_date.isoformat() if has_close else None,
        payment_due_date=due_date.isoformat() if has_due else None,
    )


def page_accounts():
    st.header("Accounts")

    # Members
    st.caption("MEMBERS")
    for i, m in enumerate(st.session_state.members):
        with st.expander(f"{m.name}  ·  {m.id}", expanded=False):
            with st.form(f"member_{m.id}"):
                new_name = st.text_input("Name", value=m.name)
                if st.form_submit_button("Save"):
                    st.session_state.members[i].name = new_name
                    st.rerun()

    st.divider()

    with st.expander("+ Add Account", expanded=False):
        acct_type = st.selectbox("Type", ACCOUNT_TYPES, key="add_acct_type")
        with st.form("add_account"):
            c1, c2 = st.columns(2)
            name  = c1.text_input("Name")
            owner = c2.selectbox("Owner", OWNERS)
            balance = st.number_input("Balance", value=0.0, step=100.0)
            rate = 0.0
            if acct_type in RATE_BEARING_TYPES:
                rate = st.number_input("Interest Rate %", value=0.0, step=0.1, min_value=0.0)
            market_value = 0.0
            if acct_type == "liability":
                market_value = st.number_input("Market Value", value=0.0, step=1000.0,
                                                help="Estimated sale value of the underlying asset")
            extra = _account_extra_fields()
            if st.form_submit_button("Add") and name:
                new_id = name.lower().replace(" ", "_") + "_" + str(uuid.uuid4())[:4]
                st.session_state.accounts.append(Account(new_id, name, acct_type, owner, balance, rate, market_value, **extra))
                st.rerun()

    st.divider()

    for i, acct in enumerate(st.session_state.accounts):
        with st.expander(f"{acct.name}  ·  {acct.owner}  ·  ${acct.balance:,.2f}"):
            acct_type = st.selectbox("Type", ACCOUNT_TYPES, index=ACCOUNT_TYPES.index(acct.type),
                                      key=f"type_{acct.id}")
            with st.form(f"acct_{acct.id}"):
                c1, c2 = st.columns(2)
                name  = c1.text_input("Name",  value=acct.name)
                owner = c2.selectbox("Owner",  OWNERS, index=OWNERS.index(acct.owner))
                balance = st.number_input("Balance", value=float(acct.balance), step=100.0)
                rate = 0.0
                if acct_type in RATE_BEARING_TYPES:
                    rate = st.number_input("Interest Rate %", value=float(acct.interest_rate), step=0.1)
                market_value = 0.0
                if acct_type == "liability":
                    market_value = st.number_input("Market Value", value=float(acct.market_value), step=1000.0,
                                                    help="Estimated sale value of the underlying asset")
                extra = _account_extra_fields(acct)
                sv, dl = st.columns([4, 1])
                if sv.form_submit_button("Save"):
                    a = st.session_state.accounts[i]
                    a.name, a.type, a.owner = name, acct_type, owner
                    a.balance, a.interest_rate = balance, rate
                    a.market_value = market_value
                    a.target_floor, a.sweep_ceiling, a.sweep_role = (
                        extra["target_floor"], extra["sweep_ceiling"], extra["sweep_role"])
                    a.statement_close_date, a.payment_due_date = (
                        extra["statement_close_date"], extra["payment_due_date"])
                    st.rerun()
                if dl.form_submit_button("Delete"):
                    st.session_state.accounts.pop(i)
                    st.rerun()


# ─── PAGE: EVENTS ─────────────────────────────────────────────────────────────

FREQUENCIES  = ["one-time", "weekly", "biweekly", "biweekly-offset", "monthly", "quarterly"]
EVENT_TYPES  = ["inflow", "outflow", "transfer"]
EXECUTION_TYPES = ["auto", "manual"]
WEEKEND_SHIFTS  = ["none", "previous_business_day", "next_business_day"]


def _event_fields(prefix: str, ev: Optional[Event] = None) -> dict:
    c1, c2 = st.columns(2)
    name       = c1.text_input("Name",  value=ev.name if ev else "")
    event_type = c2.selectbox("Type",   EVENT_TYPES, index=EVENT_TYPES.index(ev.event_type) if ev else 0)
    amount     = st.number_input("Amount", value=float(ev.amount) if ev else 0.0, step=10.0)
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
    notes     = st.text_input("Notes", value=ev.notes if ev else "")
    active    = st.checkbox("Active", value=ev.active if ev else True) if ev else True

    c13, c14 = st.columns(2)
    execution = c13.selectbox(
        "Execution", EXECUTION_TYPES, index=EXECUTION_TYPES.index(ev.execution) if ev else 0,
        help="auto = the bank moves this on its own; manual = you make this transfer yourself")
    weekend_shift = c14.selectbox(
        "Weekend Shift", WEEKEND_SHIFTS, index=WEEKEND_SHIFTS.index(ev.weekend_shift) if ev else 0,
        help="How this date moves if the cycle lands on a Saturday/Sunday")

    return dict(name=name, event_type=event_type,
                amount=amount, from_id=from_id, to_id=to_id,
                frequency=frequency, anchor=anchor, has_end=has_end, end_val=end_val,
                notes=notes, active=active, execution=execution, weekend_shift=weekend_shift)


def page_events():
    st.header("Events")

    with st.expander("+ Add Event", expanded=False):
        with st.form("add_event"):
            f = _event_fields("add")
            if st.form_submit_button("Add Event") and f["name"]:
                st.session_state.events.append(Event(
                    id=str(uuid.uuid4()), name=f["name"], event_type=f["event_type"],
                    amount=f["amount"],
                    from_account_id=f["from_id"], to_account_id=f["to_id"],
                    frequency=f["frequency"], anchor_date=f["anchor"].isoformat(),
                    end_date=f["end_val"].isoformat() if f["has_end"] else None,
                    notes=f["notes"], execution=f["execution"],
                    weekend_shift=f["weekend_shift"],
                ))
                st.rerun()

    st.divider()

    fc1, fc2 = st.columns(2)
    f_type   = fc1.multiselect("Type",   EVENT_TYPES, default=EVENT_TYPES)
    f_status = fc2.radio("Status", ["All", "Active", "Inactive"], horizontal=True)

    shown = [
        e for e in st.session_state.events
        if e.event_type in f_type
        and (f_status == "All" or (f_status == "Active") == e.active)
    ]

    for event in shown:
        real_idx = st.session_state.events.index(event)
        end_str  = f" → {event.end_date}" if event.end_date else ""
        flag     = "✓" if event.active else "✗"
        exec_tag = "  ✋ manual" if event.execution == "manual" else ""
        label    = f"{flag} {event.name}  ·  ${event.amount:,.0f}  ·  {event.frequency}{end_str}{exec_tag}"

        with st.expander(label):
            with st.form(f"evt_{event.id}"):
                f = _event_fields(event.id, event)
                sv, dl = st.columns([4, 1])
                if sv.form_submit_button("Save"):
                    e = st.session_state.events[real_idx]
                    e.name, e.event_type = f["name"], f["event_type"]
                    e.amount = f["amount"]
                    e.from_account_id, e.to_account_id = f["from_id"], f["to_id"]
                    e.frequency   = f["frequency"]
                    e.anchor_date = f["anchor"].isoformat()
                    e.end_date    = f["end_val"].isoformat() if f["has_end"] else None
                    e.notes, e.active = f["notes"], f["active"]
                    e.execution = f["execution"]
                    e.weekend_shift = f["weekend_shift"]
                    st.rerun()
                if dl.form_submit_button("Delete"):
                    st.session_state.events.pop(real_idx)
                    st.rerun()


# ─── PAGE: TIMELINE ───────────────────────────────────────────────────────────

def page_timeline():
    st.header("Timeline")

    c1, c2 = st.columns(2)
    start = c1.date_input("From", value=date.today())
    end   = c2.date_input("To",   value=date.today() + timedelta(days=56))

    if start > end:
        st.error("Start date must be before end date.")
        return

    cal = build_calendar(st.session_state.events, start, end)

    if not cal:
        st.info("No events in this range.")
        return

    for dt, grp in groupby(cal, key=lambda x: x["date"]):
        items     = list(grp)
        is_payday = any(r["type"] == "inflow" for r in items)
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
    c1, c2 = st.columns(2)
    c1.download_button("accounts.csv",
                       data=pd.DataFrame([asdict(a) for a in st.session_state.accounts]).to_csv(index=False),
                       file_name="accounts.csv", mime="text/csv")
    c2.download_button("events.csv",
                       data=pd.DataFrame([asdict(e) for e in st.session_state.events]).to_csv(index=False),
                       file_name="events.csv", mime="text/csv")

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
    "Export":       page_export,
}

PAGE_ICONS = {
    "Dashboard":    "📊",
    "Accounts":     "🏦",
    "Events":       "📅",
    "Timeline":     "🗓️",
    "Flow Diagram": "🔀",
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
