# engine.py — Serialization, default data, calendar, projection, and buffer calculations

import json
import uuid
import calendar
from dataclasses import asdict, fields
from datetime import date, timedelta
from typing import Optional, List

import pandas as pd

from payday_planner.models import Member, Account, Event


# ─── SERIALIZATION ────────────────────────────────────────────────────────────

# Every account keeps the core identity/balance fields; which of the type-specific
# fields also get exported depends on account type, so debt accounts don't carry
# sweep thresholds, chequing accounts don't carry statement dates, etc.
_ACCOUNT_CORE_FIELDS = ["id", "name", "type", "owner", "balance"]
_ACCOUNT_TYPE_FIELDS = {
    "chequing":   ["target_floor", "sweep_ceiling", "sweep_role"],
    "savings":    ["interest_rate", "target_floor", "sweep_ceiling", "sweep_role"],
    "investment": ["target_floor", "sweep_ceiling", "sweep_role"],
    "debt":       ["statement_close_date", "payment_due_date"],
    "liability":  ["interest_rate", "market_value", "statement_close_date", "payment_due_date"],
}
_ACCOUNT_FIELD_NAMES = {f.name for f in fields(Account)}


def _account_to_dict(a: Account) -> dict:
    d = asdict(a)
    keep = _ACCOUNT_CORE_FIELDS + _ACCOUNT_TYPE_FIELDS.get(a.type, [])
    return {k: d[k] for k in keep}


def _event_to_dict(e: Event) -> dict:
    d = asdict(e)
    nxt = next_occurrence(e, date.today())
    if nxt:
        d["next_occurrence"] = nxt
    return d


def blueprint_to_json(ss) -> str:
    return json.dumps({
        "members":  [asdict(m) for m in ss.members],
        "accounts": [_account_to_dict(a) for a in ss.accounts],
        "events":   [_event_to_dict(e) for e in ss.events],
    }, indent=2)


_ACCOUNT_TYPES   = {"chequing", "savings", "debt", "investment", "liability"}
_EVENT_TYPES     = {"inflow", "outflow", "transfer"}
_FREQUENCIES     = {"one-time", "weekly", "biweekly", "biweekly-offset", "monthly", "quarterly"}
_SWEEP_ROLES     = {"buffer", "restricted"}
_EXECUTION_TYPES = {"auto", "manual"}
_WEEKEND_SHIFTS   = {"none", "previous_business_day", "next_business_day"}
_MAX_BYTES       = 5 * 1024 * 1024  # 5 MB


def _require(obj: dict, field: str, kind, label: str):
    if field not in obj:
        raise ValueError(f"{label}: missing required field '{field}'")
    if not isinstance(obj[field], kind):
        type_name = " or ".join(k.__name__ for k in kind) if isinstance(kind, tuple) else kind.__name__
        raise ValueError(f"{label}: '{field}' must be {type_name}, got {type(obj[field]).__name__}")


def _require_optional_number(obj: dict, field: str, label: str):
    val = obj.get(field)
    if val is not None and not isinstance(val, (int, float)):
        raise ValueError(f"{label}: '{field}' must be a number or null")


def _require_optional_enum(obj: dict, field: str, allowed: set, label: str):
    val = obj.get(field)
    if val is not None and val not in allowed:
        raise ValueError(f"{label}: invalid {field} {val!r}, must be one of {sorted(allowed)}")


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
        for num_field in ("target_floor", "sweep_ceiling"):
            _require_optional_number(a, num_field, lbl)
        _require_optional_enum(a, "sweep_role", _SWEEP_ROLES, lbl)
        _require_isodate(a, "statement_close_date", lbl, required=False)
        _require_isodate(a, "payment_due_date",     lbl, required=False)

    for i, e in enumerate(data.get("events", [])):
        lbl = f"events[{i}] ({e.get('name', '?')})"
        _require(e, "id",          str,   lbl)
        _require(e, "name",        str,   lbl)
        _require(e, "event_type",  str,   lbl)
        _require(e, "frequency",   str,   lbl)
        _require(e, "amount",      (int, float), lbl)
        if e["event_type"] not in _EVENT_TYPES:
            raise ValueError(f"{lbl}: invalid event_type {e['event_type']!r}, must be one of {sorted(_EVENT_TYPES)}")
        if e["frequency"] not in _FREQUENCIES:
            raise ValueError(f"{lbl}: invalid frequency {e['frequency']!r}, must be one of {sorted(_FREQUENCIES)}")
        if e["amount"] < 0:
            raise ValueError(f"{lbl}: 'amount' must be >= 0")
        _require_isodate(e, "anchor_date", lbl, required=True)
        _require_isodate(e, "end_date",    lbl, required=False)
        _require_optional_enum(e, "execution",     _EXECUTION_TYPES, lbl)
        _require_optional_enum(e, "weekend_shift", _WEEKEND_SHIFTS,  lbl)


def json_to_blueprint(raw: str) -> dict:
    if len(raw.encode()) > _MAX_BYTES:
        raise ValueError(f"Blueprint exceeds maximum allowed size of {_MAX_BYTES // 1024 // 1024} MB")
    data = json.loads(raw)
    _validate_blueprint(data)
    return {
        "members":  [Member(**m)         for m in data.get("members", [])],
        "accounts": [Account(**{k: v for k, v in a.items() if k in _ACCOUNT_FIELD_NAMES})
                     for a in data.get("accounts", [])],
        "events":   [Event(**{k: v for k, v in e.items() if k != "next_occurrence"})
                     for e in data.get("events", [])],
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
        Event(str(uuid.uuid4()), "A Paycheque", "inflow", 2500,
              None, "chq_a", "biweekly", "2026-01-02"),
        Event(str(uuid.uuid4()), "B Paycheque", "inflow", 2000,
              None, "chq_b", "biweekly", "2026-01-09"),
        Event(str(uuid.uuid4()), "A Personal Bills", "outflow", 400,
              "chq_a", None, "monthly", "2026-01-01"),
        Event(str(uuid.uuid4()), "B Personal Bills", "outflow", 300,
              "chq_b", None, "monthly", "2026-01-01"),
        Event(str(uuid.uuid4()), "Installment Payment", "outflow", 200,
              "chq_a", None, "monthly", "2026-01-01", end_date="2026-06-30"),
        Event(str(uuid.uuid4()), "A → Joint Hub", "transfer", 1500,
              "chq_a", "hub", "biweekly", "2026-01-02"),
        Event(str(uuid.uuid4()), "B → Joint Hub", "transfer", 1200,
              "chq_b", "hub", "biweekly", "2026-01-09"),
        Event(str(uuid.uuid4()), "Mortgage", "outflow", 1800,
              "hub", "mtg", "monthly", "2026-01-01"),
        Event(str(uuid.uuid4()), "Shared Bills", "outflow", 500,
              "hub", None, "monthly", "2026-01-01"),
        Event(str(uuid.uuid4()), "LOC Payment", "transfer", 500,
              "hub", "loc", "biweekly", "2026-01-02", end_date="2026-12-31"),
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


def _apply_weekend_shift(d: date, rule: str) -> date:
    """Shift a date off a weekend per `rule`. Saturday=5, Sunday=6."""
    if rule == "previous_business_day":
        if d.weekday() == 5:
            return d - timedelta(days=1)
        if d.weekday() == 6:
            return d - timedelta(days=2)
    elif rule == "next_business_day":
        if d.weekday() == 5:
            return d + timedelta(days=2)
        if d.weekday() == 6:
            return d + timedelta(days=1)
    return d


def get_occurrences(event: Event, start: date, end: date) -> List[date]:
    if not event.active:
        return []
    anchor  = date.fromisoformat(event.anchor_date)
    end_cap = date.fromisoformat(event.end_date) if event.end_date else None
    shift   = lambda d: _apply_weekend_shift(d, event.weekend_shift)

    def ok(d: date) -> bool:
        return start <= d <= end and (end_cap is None or d <= end_cap)

    if event.frequency == "one-time":
        shifted = shift(anchor)
        return [shifted] if ok(shifted) else []

    results = []

    if event.frequency in ("biweekly", "biweekly-offset"):
        cur = anchor
        while shift(cur) < start:
            cur += timedelta(days=14)
        while shift(cur) <= end:
            shifted = shift(cur)
            if ok(shifted):
                results.append(shifted)
            cur += timedelta(days=14)

    elif event.frequency == "weekly":
        cur = anchor
        while shift(cur) < start:
            cur += timedelta(days=7)
        while shift(cur) <= end:
            shifted = shift(cur)
            if ok(shifted):
                results.append(shifted)
            cur += timedelta(days=7)

    elif event.frequency == "monthly":
        cur = anchor
        while shift(cur) < start:
            cur = _advance_month(cur)
        while shift(cur) <= end:
            shifted = shift(cur)
            if ok(shifted):
                results.append(shifted)
            cur = _advance_month(cur)

    elif event.frequency == "quarterly":
        cur = anchor
        while shift(cur) < start:
            cur = _advance_quarter(cur)
        while shift(cur) <= end:
            shifted = shift(cur)
            if ok(shifted):
                results.append(shifted)
            cur = _advance_quarter(cur)

    return results


def next_occurrence(event: Event, from_date: date) -> Optional[str]:
    """Return the ISO date of the next occurrence of `event` on or after `from_date`."""
    if not event.active:
        return None
    anchor  = date.fromisoformat(event.anchor_date)
    end_cap = date.fromisoformat(event.end_date) if event.end_date else None
    shift   = lambda d: _apply_weekend_shift(d, event.weekend_shift)

    cur = anchor
    if event.frequency == "one-time":
        pass
    elif event.frequency in ("biweekly", "biweekly-offset"):
        while shift(cur) < from_date:
            cur += timedelta(days=14)
    elif event.frequency == "weekly":
        while shift(cur) < from_date:
            cur += timedelta(days=7)
    elif event.frequency == "monthly":
        while shift(cur) < from_date:
            cur = _advance_month(cur)
    elif event.frequency == "quarterly":
        while shift(cur) < from_date:
            cur = _advance_quarter(cur)
    else:
        return None

    shifted = shift(cur)
    if shifted < from_date:
        return None
    if end_cap is not None and shifted > end_cap:
        return None
    return shifted.isoformat()


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
                "from_account_id": event.from_account_id,
                "to_account_id":   event.to_account_id,
                "notes":           event.notes,
            })
    rows.sort(key=lambda x: x["date"])
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
