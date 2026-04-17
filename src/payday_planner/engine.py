# engine.py — Serialization, default data, calendar, projection, and buffer calculations

import json
import uuid
import calendar
from dataclasses import asdict
from datetime import date, timedelta
from typing import Optional, List

import pandas as pd

from payday_planner.models import Member, Account, Event, AllocationRule, Goal


# ─── SERIALIZATION ────────────────────────────────────────────────────────────

def _compute_summary(accounts: List[Account], events: List[Event], goals: List[Goal]) -> dict:
    """Compute snapshot metrics embedded in the exported blueprint."""
    bw = 12 / 26  # biweekly-to-monthly conversion factor

    # ── Net worth ──────────────────────────────────────────────────────────────
    acct_map = {a.id: a for a in accounts}
    liquid      = sum(a.balance for a in accounts if a.type in ("chequing", "savings", "investment"))
    debt        = sum(a.balance for a in accounts if a.type == "debt")
    re_equity   = sum(a.market_value - a.balance for a in accounts
                      if a.type == "liability" and a.market_value > 0)
    naked_liab  = sum(a.balance for a in accounts
                      if a.type == "liability" and a.market_value == 0)
    net_worth   = liquid - debt + re_equity - naked_liab

    # ── Biweekly cashflow (money in/out of the household — transfers are internal)
    active = [e for e in events if e.active and e.frequency != "one-time"]
    mo_in  = sum(e.amount * _monthly_rate(e.frequency) for e in active if e.event_type == "inflow")
    mo_out = sum(e.amount * _monthly_rate(e.frequency) for e in active if e.event_type == "outflow")
    bw_in  = round(mo_in  * bw, 2)
    bw_out = round(mo_out * bw, 2)

    # ── Guilt-free buffers ────────────────────────────────────────────────────
    buffers = guilt_free_buffers(accounts, events)
    gf_section = {}
    for owner, (avg_mo, safe_bw) in buffers.items():
        gf_section[owner] = {
            "avg_monthly":    round(avg_mo,  2),
            "safe_biweekly":  round(safe_bw, 2),
        }

    # ── Goal progress ─────────────────────────────────────────────────────────
    goal_progress = []
    for g in goals:
        acct = acct_map.get(g.account_id)
        if acct is None:
            continue
        current = acct.balance
        target  = g.target_balance
        if acct.type in ("debt", "liability"):
            pct = 100.0 if current == 0 else round((1 - current / target) * 100, 1) if target != 0 else 0.0
        else:
            pct = round((current / target) * 100, 1) if target != 0 else 100.0
        goal_progress.append({
            "name":            g.name,
            "account_id":      g.account_id,
            "current_balance": round(current, 2),
            "target_balance":  target,
            "target_date":     g.target_date,
            "pct_complete":    pct,
        })

    return {
        "generated_at":      date.today().isoformat(),
        "net_worth":         round(net_worth, 2),
        "liquid_assets":     round(liquid,    2),
        "total_debt":        round(debt,      2),
        "real_estate_equity": round(re_equity, 2),
        "biweekly_cashflow": {
            "inflow":  bw_in,
            "outflow": bw_out,
            "net":     round(bw_in - bw_out, 2),
            "monthly_inflow":  round(mo_in,  2),
            "monthly_outflow": round(mo_out, 2),
            "monthly_net":     round(mo_in - mo_out, 2),
        },
        "guilt_free_buffers": gf_section,
        "goal_progress":      goal_progress,
    }


def blueprint_to_ai_context(ss) -> str:
    """
    Produce a clean, token-efficient snapshot for pasting into AI chat.
    Strips UI noise (colors, empty fields, UUIDs), resolves account IDs to
    names, and puts the summary first so the AI has immediate orientation.
    """
    today = date.today().isoformat()
    acct_name = {a.id: a.name for a in ss.accounts}

    # ── Members ───────────────────────────────────────────────────────────────
    members = [{"id": m.id, "name": m.name} for m in ss.members]

    # ── Accounts ──────────────────────────────────────────────────────────────
    accounts = []
    for a in ss.accounts:
        entry: dict = {"name": a.name, "type": a.type, "owner": a.owner, "balance": round(a.balance, 2)}
        if a.interest_rate:
            entry["interest_rate"] = a.interest_rate
        if a.market_value:
            entry["market_value"] = a.market_value
            entry["equity"] = round(a.market_value - a.balance, 2)
        if a.notes:
            entry["notes"] = a.notes
        accounts.append(entry)

    # ── Events ────────────────────────────────────────────────────────────────
    events = []
    for e in ss.events:
        if not e.active:
            continue
        entry = {
            "name":      e.name,
            "type":      e.event_type,
            "amount":    e.amount,
            "frequency": e.frequency,
            "anchor":    e.anchor_date,
        }
        if e.end_date:
            entry["ends"] = e.end_date
        if e.from_account_id:
            entry["from"] = acct_name.get(e.from_account_id, e.from_account_id)
        if e.to_account_id:
            entry["to"] = acct_name.get(e.to_account_id, e.to_account_id)
        if e.owner:
            entry["owner"] = e.owner
        if e.notes:
            entry["notes"] = e.notes
        events.append(entry)

    # ── Goals ─────────────────────────────────────────────────────────────────
    goals = []
    for g in ss.goals:
        entry = {
            "name":    g.name,
            "account": acct_name.get(g.account_id, g.account_id),
            "target":  g.target_balance,
            "by":      g.target_date,
        }
        if g.notes:
            entry["notes"] = g.notes
        goals.append(entry)

    summary = _compute_summary(ss.accounts, ss.events, ss.goals)

    doc = {
        "as_of":    today,
        "members":  members,
        "summary":  summary,
        "accounts": accounts,
        "events":   events,
        "goals":    goals,
    }
    return json.dumps(doc, indent=2)


def blueprint_to_json(ss) -> str:
    return json.dumps({
        "members":  [asdict(m) for m in ss.members],
        "accounts": [asdict(a) for a in ss.accounts],
        "events":   [asdict(e) for e in ss.events],
        "rules":    [asdict(r) for r in ss.rules],
        "goals":    [asdict(g) for g in ss.goals],
        "summary":  _compute_summary(ss.accounts, ss.events, ss.goals),
    }, indent=2)


_ACCOUNT_TYPES  = {"chequing", "savings", "debt", "investment", "liability"}
_EVENT_TYPES    = {"inflow", "outflow", "transfer"}
_AMOUNT_TYPES   = {"fixed", "percentage", "remainder"}
_FREQUENCIES    = {"one-time", "weekly", "biweekly", "biweekly-offset", "monthly", "quarterly"}
_MAX_BYTES      = 5 * 1024 * 1024  # 5 MB


def _require(obj: dict, field: str, kind, label: str):
    if field not in obj:
        raise ValueError(f"{label}: missing required field '{field}'")
    if not isinstance(obj[field], kind):
        type_name = " or ".join(k.__name__ for k in kind) if isinstance(kind, tuple) else kind.__name__
        raise ValueError(f"{label}: '{field}' must be {type_name}, got {type(obj[field]).__name__}")


def _require_isodate(obj: dict, field: str, label: str, required: bool = True):
    val = obj.get(field)
    if val is None:
        if required:
            raise ValueError(f"{label}: missing required field '{field}'")
        return
    if not isinstance(val, str):
        raise ValueError(f"{label}: '{field}' must be a string")
    try:
        date.fromisoformat(val)
    except ValueError:
        raise ValueError(f"{label}: '{field}' is not a valid ISO date: {val!r}")


def _validate_blueprint(data: dict):
    if not isinstance(data, dict):
        raise ValueError("Blueprint must be a JSON object")

    for i, m in enumerate(data.get("members", [])):
        lbl = f"members[{i}]"
        _require(m, "id",   str, lbl)
        _require(m, "name", str, lbl)

    for i, a in enumerate(data.get("accounts", [])):
        lbl = f"accounts[{i}] ({a.get('name', '?')})"
        _require(a, "id",      str,   lbl)
        _require(a, "name",    str,   lbl)
        _require(a, "type",    str,   lbl)
        _require(a, "owner",   str,   lbl)
        if a["type"] not in _ACCOUNT_TYPES:
            raise ValueError(f"{lbl}: invalid type {a['type']!r}, must be one of {sorted(_ACCOUNT_TYPES)}")
        for num_field in ("balance", "interest_rate", "market_value"):
            if num_field in a and not isinstance(a[num_field], (int, float)):
                raise ValueError(f"{lbl}: '{num_field}' must be a number")

    for i, e in enumerate(data.get("events", [])):
        lbl = f"events[{i}] ({e.get('name', '?')})"
        _require(e, "id",          str,   lbl)
        _require(e, "name",        str,   lbl)
        _require(e, "event_type",  str,   lbl)
        _require(e, "amount_type", str,   lbl)
        _require(e, "frequency",   str,   lbl)
        _require(e, "amount",      (int, float), lbl)
        if e["event_type"] not in _EVENT_TYPES:
            raise ValueError(f"{lbl}: invalid event_type {e['event_type']!r}, must be one of {sorted(_EVENT_TYPES)}")
        if e["amount_type"] not in _AMOUNT_TYPES:
            raise ValueError(f"{lbl}: invalid amount_type {e['amount_type']!r}, must be one of {sorted(_AMOUNT_TYPES)}")
        if e["frequency"] not in _FREQUENCIES:
            raise ValueError(f"{lbl}: invalid frequency {e['frequency']!r}, must be one of {sorted(_FREQUENCIES)}")
        if e["amount"] < 0:
            raise ValueError(f"{lbl}: 'amount' must be >= 0")
        _require_isodate(e, "anchor_date", lbl, required=True)
        _require_isodate(e, "end_date",    lbl, required=False)

    for i, r in enumerate(data.get("rules", [])):
        lbl = f"rules[{i}] ({r.get('name', '?')})"
        _require(r, "id",       str, lbl)
        _require(r, "name",     str, lbl)
        _require(r, "priority", int, lbl)

    for i, g in enumerate(data.get("goals", [])):
        lbl = f"goals[{i}] ({g.get('name', '?')})"
        _require(g, "id",             str,           lbl)
        _require(g, "name",           str,           lbl)
        _require(g, "account_id",     str,           lbl)
        _require(g, "target_balance", (int, float),  lbl)
        _require_isodate(g, "target_date", lbl, required=True)


def json_to_blueprint(raw: str) -> dict:
    if len(raw.encode()) > _MAX_BYTES:
        raise ValueError(f"Blueprint exceeds maximum allowed size of {_MAX_BYTES // 1024 // 1024} MB")
    data = json.loads(raw)
    _validate_blueprint(data)
    return {
        "members":  [Member(**m)         for m in data.get("members", [])],
        "accounts": [Account(**a)        for a in data.get("accounts", [])],
        "events":   [Event(**e)          for e in data.get("events", [])],
        "rules":    [AllocationRule(**r) for r in data.get("rules", [])],
        "goals":    [Goal(**g)           for g in data.get("goals", [])],
    }


# ─── DEFAULT DATA ─────────────────────────────────────────────────────────────

def _default_accounts():
    return [
        Account("chq_a",   "Chequing A",     "chequing",   "A",     balance=0),
        Account("chq_b",   "Chequing B",     "chequing",   "B",     balance=0),
        Account("hub",     "Joint Hub",      "savings",    "Joint", balance=0),
        Account("sav1",    "Emergency Fund", "savings",    "Joint", balance=5000),
        Account("sav2",    "Goals Fund",     "savings",    "Joint", balance=0),
        Account("loc",     "Line of Credit", "debt",       "A",     balance=0),
        Account("inv_a",   "Investment A",   "investment", "A",     balance=0),
        Account("inv_b",   "Investment B",   "investment", "B",     balance=0),
        Account("mtg",     "Mortgage",       "liability",  "Joint", balance=0),
    ]


def _default_events():
    return [
        Event(str(uuid.uuid4()), "A Paycheque", "inflow", 2500, "fixed",
              None, "chq_a", "biweekly", "2026-01-02",
              owner="A", tier=1, tags=["income"]),
        Event(str(uuid.uuid4()), "B Paycheque", "inflow", 2000, "fixed",
              None, "chq_b", "biweekly", "2026-01-09",
              owner="B", tier=1, tags=["income"]),
        Event(str(uuid.uuid4()), "A Personal Bills", "outflow", 400, "fixed",
              "chq_a", None, "monthly", "2026-01-01",
              owner="A", tier=2, tags=["bills"]),
        Event(str(uuid.uuid4()), "B Personal Bills", "outflow", 300, "fixed",
              "chq_b", None, "monthly", "2026-01-01",
              owner="B", tier=2, tags=["bills"]),
        Event(str(uuid.uuid4()), "Installment Payment", "outflow", 200, "fixed",
              "chq_a", None, "monthly", "2026-01-01", end_date="2026-06-30",
              owner="A", tier=2, tags=["temporary"]),
        Event(str(uuid.uuid4()), "A → Joint Hub", "transfer", 1500, "fixed",
              "chq_a", "hub", "biweekly", "2026-01-02",
              owner="A", tier=3, tags=["hub"]),
        Event(str(uuid.uuid4()), "B → Joint Hub", "transfer", 1200, "fixed",
              "chq_b", "hub", "biweekly", "2026-01-09",
              owner="B", tier=3, tags=["hub"]),
        Event(str(uuid.uuid4()), "Mortgage", "outflow", 1800, "fixed",
              "hub", "mtg", "monthly", "2026-01-01",
              owner="Joint", tier=4, tags=["housing"]),
        Event(str(uuid.uuid4()), "Shared Bills", "outflow", 500, "fixed",
              "hub", None, "monthly", "2026-01-01",
              owner="Joint", tier=4, tags=["bills"]),
        Event(str(uuid.uuid4()), "LOC Payment", "transfer", 500, "fixed",
              "hub", "loc", "biweekly", "2026-01-02", end_date="2026-12-31",
              owner="Joint", tier=5, tags=["debt", "priority"]),
    ]


def _default_rules():
    return [
        AllocationRule(str(uuid.uuid4()), "Debt Payoff Priority", 1,
                       "percentage", 40, "hub", "loc",
                       condition_account_id="loc", condition_operator="gt", condition_value=0,
                       notes="Pay down line of credit first"),
        AllocationRule(str(uuid.uuid4()), "Emergency Fund", 2,
                       "percentage", 30, "hub", "sav1",
                       notes="Build emergency fund to 3–6 months of expenses"),
        AllocationRule(str(uuid.uuid4()), "Goals Fund", 3,
                       "percentage", 20, "hub", "sav2",
                       notes="Vacations, large purchases, etc."),
        AllocationRule(str(uuid.uuid4()), "Investments", 4,
                       "percentage", 10, "hub", "inv_a",
                       notes="Remainder to investments"),
    ]


def _default_goals():
    return [
        Goal(str(uuid.uuid4()), "Emergency Fund",  "sav1", 15000, "2026-12-31",
             "3–6 months of expenses"),
        Goal(str(uuid.uuid4()), "Pay Off LOC",     "loc",  0,     "2026-12-31",
             "Clear line of credit"),
        Goal(str(uuid.uuid4()), "Goals Fund",      "sav2", 5000,  "2027-06-30",
             "Savings for upcoming goals"),
    ]


# ─── CALENDAR ENGINE ──────────────────────────────────────────────────────────

def _advance_month(d: date) -> date:
    year, month = d.year, d.month
    if month == 12:
        year, month = year + 1, 1
    else:
        month += 1
    last = calendar.monthrange(year, month)[1]
    return d.replace(year=year, month=month, day=min(d.day, last))


def _advance_quarter(d: date) -> date:
    m = d.month + 3
    y = d.year + (m - 1) // 12
    m = ((m - 1) % 12) + 1
    last = calendar.monthrange(y, m)[1]
    return d.replace(year=y, month=m, day=min(d.day, last))


def get_occurrences(event: Event, start: date, end: date) -> List[date]:
    if not event.active:
        return []
    anchor  = date.fromisoformat(event.anchor_date)
    end_cap = date.fromisoformat(event.end_date) if event.end_date else None

    def ok(d: date) -> bool:
        return start <= d <= end and (end_cap is None or d <= end_cap)

    if event.frequency == "one-time":
        return [anchor] if ok(anchor) else []

    results = []

    if event.frequency in ("biweekly", "biweekly-offset"):
        cur = anchor
        while cur < start:
            cur += timedelta(days=14)
        while cur <= end:
            if ok(cur):
                results.append(cur)
            cur += timedelta(days=14)

    elif event.frequency == "weekly":
        cur = anchor
        while cur < start:
            cur += timedelta(days=7)
        while cur <= end:
            if ok(cur):
                results.append(cur)
            cur += timedelta(days=7)

    elif event.frequency == "monthly":
        cur = anchor
        while cur < start:
            cur = _advance_month(cur)
        while cur <= end:
            if ok(cur):
                results.append(cur)
            cur = _advance_month(cur)

    elif event.frequency == "quarterly":
        cur = anchor
        while cur < start:
            cur = _advance_quarter(cur)
        while cur <= end:
            if ok(cur):
                results.append(cur)
            cur = _advance_quarter(cur)

    return results


def build_calendar(events: List[Event], start: date, end: date) -> List[dict]:
    rows = []
    for event in events:
        for occ in get_occurrences(event, start, end):
            rows.append({
                "date":            occ,
                "id":              event.id,
                "name":            event.name,
                "type":            event.event_type,
                "amount":          event.amount,
                "amount_type":     event.amount_type,
                "from_account_id": event.from_account_id,
                "to_account_id":   event.to_account_id,
                "owner":           event.owner,
                "tier":            event.tier,
                "tags":            event.tags,
                "notes":           event.notes,
            })
    rows.sort(key=lambda x: (x["date"], x["tier"]))
    return rows


# ─── PROJECTION ENGINE ────────────────────────────────────────────────────────

def project_balances(accounts: List[Account], events: List[Event],
                     start: date, end: date) -> "pd.DataFrame":
    """
    Simulate all events day-by-day from start to end.
    Returns a DataFrame indexed by date with one column per account id,
    plus a synthetic 'Net Worth' column.
    """
    balances = {a.id: a.balance for a in accounts}
    acct_map = {a.id: a for a in accounts}
    cal      = build_calendar(events, start, end)
    cal_by_date: dict = {}
    for row in cal:
        cal_by_date.setdefault(row["date"], []).append(row)

    rows = []
    cur = start
    while cur <= end:
        for event in cal_by_date.get(cur, []):
            amt = event["amount"]
            fid = event["from_account_id"]
            tid = event["to_account_id"]
            if event["type"] == "inflow":
                if tid in balances:
                    balances[tid] += amt
            elif event["type"] == "outflow":
                if fid in balances:
                    balances[fid] -= amt
            elif event["type"] == "transfer":
                if fid in balances:
                    balances[fid] -= amt
                if tid in balances:
                    dest = acct_map.get(tid)
                    if dest and dest.type in ("debt", "liability"):
                        balances[tid] -= amt   # payment reduces what is owed
                    else:
                        balances[tid] += amt
        rows.append({"date": cur, **balances})
        cur += timedelta(days=1)

    df = pd.DataFrame(rows).set_index("date")

    asset_ids      = [a.id for a in accounts if a.type in ("chequing", "savings", "investment")]
    debt_ids       = [a.id for a in accounts if a.type == "debt"]
    re_ids         = [a.id for a in accounts if a.type == "liability" and a.market_value > 0]
    naked_liab_ids = [a.id for a in accounts if a.type == "liability" and a.market_value == 0]
    re_market_sum  = sum(a.market_value for a in accounts if a.type == "liability" and a.market_value > 0)

    liquid     = df[[c for c in asset_ids      if c in df.columns]].sum(axis=1)
    debt       = df[[c for c in debt_ids       if c in df.columns]].sum(axis=1)
    re_owed    = df[[c for c in re_ids         if c in df.columns]].sum(axis=1)
    naked_liab = df[[c for c in naked_liab_ids if c in df.columns]].sum(axis=1)

    df["Net Worth"] = liquid + (re_market_sum - re_owed) - naked_liab - debt
    return df


# ─── GUILT-FREE BUFFER ────────────────────────────────────────────────────────

def _monthly_rate(frequency: str) -> float:
    """Approximate occurrences per month for normalizing recurring amounts."""
    return {
        "weekly":          52 / 12,
        "biweekly":        26 / 12,
        "biweekly-offset": 26 / 12,
        "monthly":         1.0,
        "quarterly":       4 / 12,
        "one-time":        0.0,
    }.get(frequency, 0.0)


def guilt_free_buffers(accounts: List[Account], events: List[Event]) -> dict:
    """
    For each non-Joint chequing account owner, returns:
      {owner_id: (avg_monthly, safe_biweekly)}

    avg_monthly   — all recurring flows normalized to monthly (the mathematical average).
    safe_biweekly — conservative worst-case per payday: counts biweekly flows at face
                    value and adds monthly bills at their full amount (as if they could
                    land on any given payday). This eliminates the "phantom buffer" caused
                    by monthly bills sitting uncollected between paydays.
    """
    chq_ids_by_owner: dict = {}
    for a in accounts:
        if a.type == "chequing" and a.owner != "Joint":
            chq_ids_by_owner.setdefault(a.owner, set()).add(a.id)

    result = {}
    for owner, chq_ids in chq_ids_by_owner.items():
        monthly_in = monthly_out = 0.0
        bw_in = bw_out = 0.0
        for e in events:
            if not e.active or e.frequency == "one-time":
                continue
            rate  = _monthly_rate(e.frequency)
            is_bw = e.frequency in ("biweekly", "biweekly-offset")
            if e.event_type == "inflow" and e.to_account_id in chq_ids:
                monthly_in += e.amount * rate
                if is_bw:
                    bw_in += e.amount
            elif e.event_type in ("outflow", "transfer") and e.from_account_id in chq_ids:
                monthly_out += e.amount * rate
                if is_bw:
                    bw_out += e.amount
                else:
                    bw_out += e.amount   # full amount as worst-case payday charge
        result[owner] = (monthly_in - monthly_out, bw_in - bw_out)
    return result
