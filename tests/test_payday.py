"""
Tests for payday.py pure logic:
  - _advance_month / _advance_quarter
  - get_occurrences (all frequencies, end_date capping, inactive events, boundaries)
  - build_calendar (sorting by date, empty input)
  - blueprint_to_json / json_to_blueprint (round-trip, partial data, invalid JSON)
  - _build_mermaid (structure, edges, inactive exclusion, ID sanitization)
  - default data integrity (account refs in events exist)
"""
import sys
import types

# Streamlit is imported at module level in app.py; patch it before import
st_stub = types.ModuleType("streamlit")
st_stub.set_page_config = lambda **kw: None
st_stub.session_state   = {}
sys.modules["streamlit"] = st_stub

from payday_planner.models import Event, Account, Member
from payday_planner.engine import (
    _advance_month,
    _advance_quarter,
    get_occurrences,
    next_occurrence,
    build_calendar,
    project_balances,
    guilt_free_buffers,
    blueprint_to_json,
    json_to_blueprint,
    _default_accounts,
    _default_events,
)
from payday_planner.app import _build_mermaid

import json
from datetime import date
import types as _t


# ─── helpers ──────────────────────────────────────────────────────────────────

def make_event(frequency, anchor, **kwargs):
    defaults = dict(
        id="test-id",
        name="Test",
        event_type="inflow",
        amount=100,
        from_account_id=None,
        to_account_id="chq_a",
        frequency=frequency,
        anchor_date=anchor,
        active=True,
    )
    defaults.update(kwargs)
    return Event(**defaults)


# ─── _advance_month ────────────────────────────────────────────────────────────

def test_advance_month_normal():
    assert _advance_month(date(2026, 1, 15)) == date(2026, 2, 15)

def test_advance_month_december_wraps():
    assert _advance_month(date(2026, 12, 1)) == date(2027, 1, 1)


# ─── _advance_quarter ─────────────────────────────────────────────────────────

def test_advance_quarter_normal():
    assert _advance_quarter(date(2026, 1, 1)) == date(2026, 4, 1)

def test_advance_quarter_wraps_year():
    assert _advance_quarter(date(2026, 11, 1)) == date(2027, 2, 1)


# ─── get_occurrences: one-time ─────────────────────────────────────────────────

def test_one_time_in_range():
    e = make_event("one-time", "2026-03-15")
    result = get_occurrences(e, date(2026, 3, 1), date(2026, 3, 31))
    assert result == [date(2026, 3, 15)]

def test_one_time_out_of_range():
    e = make_event("one-time", "2026-05-01")
    result = get_occurrences(e, date(2026, 3, 1), date(2026, 3, 31))
    assert result == []


# ─── get_occurrences: biweekly ────────────────────────────────────────────────

def test_biweekly_basic():
    # anchor 2026-01-02 (Friday); 4-week window → 2 occurrences
    e = make_event("biweekly", "2026-01-02")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 1, 31))
    assert date(2026, 1, 2)  in result
    assert date(2026, 1, 16) in result
    assert date(2026, 1, 30) in result
    assert len(result) == 3

def test_biweekly_offset_uses_separate_anchor():
    # Person B: anchor Jan 9 → appears Jan 9, 23
    e = make_event("biweekly-offset", "2026-01-09")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 1, 31))
    assert date(2026, 1, 9)  in result
    assert date(2026, 1, 23) in result
    assert date(2026, 1, 2)  not in result

def test_biweekly_start_after_anchor():
    # Start window after the anchor; should still find events from correct cadence
    e = make_event("biweekly", "2026-01-02")
    result = get_occurrences(e, date(2026, 2, 1), date(2026, 2, 28))
    assert date(2026, 2, 13) in result
    assert date(2026, 2, 27) in result
    assert date(2026, 1, 2)  not in result


# ─── get_occurrences: weekly ──────────────────────────────────────────────────

def test_weekly_produces_correct_count():
    e = make_event("weekly", "2026-01-05")  # Monday
    result = get_occurrences(e, date(2026, 1, 5), date(2026, 1, 26))
    assert len(result) == 4
    assert all(d.weekday() == 0 for d in result)  # all Mondays


# ─── get_occurrences: monthly ─────────────────────────────────────────────────

def test_monthly_produces_correct_count():
    e = make_event("monthly", "2026-01-01")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 6, 30))
    assert len(result) == 6
    assert result[0] == date(2026, 1, 1)
    assert result[-1] == date(2026, 6, 1)

def test_monthly_start_mid_range():
    e = make_event("monthly", "2026-01-15")
    result = get_occurrences(e, date(2026, 3, 1), date(2026, 5, 31))
    assert result == [date(2026, 3, 15), date(2026, 4, 15), date(2026, 5, 15)]


# ─── get_occurrences: quarterly ───────────────────────────────────────────────

def test_quarterly_basic():
    e = make_event("quarterly", "2026-01-01")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 12, 31))
    assert result == [
        date(2026, 1, 1),
        date(2026, 4, 1),
        date(2026, 7, 1),
        date(2026, 10, 1),
    ]


# ─── get_occurrences: weekend_shift ──────────────────────────────────────────
# 2026-01-01 is a Thursday, so 2026-01-03/04 are Sat/Sun and 2026-01-17 is a Sat.

def test_weekend_shift_none_leaves_saturday_unshifted():
    e = make_event("one-time", "2026-01-03")  # default weekend_shift = "none"
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 1, 31))
    assert result == [date(2026, 1, 3)]

def test_weekend_shift_previous_business_day_saturday():
    e = make_event("one-time", "2026-01-03", weekend_shift="previous_business_day")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 1, 31))
    assert result == [date(2026, 1, 2)]  # Friday

def test_weekend_shift_previous_business_day_sunday():
    e = make_event("one-time", "2026-01-04", weekend_shift="previous_business_day")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 1, 31))
    assert result == [date(2026, 1, 2)]  # Friday

def test_weekend_shift_next_business_day_saturday():
    e = make_event("one-time", "2026-01-03", weekend_shift="next_business_day")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 1, 31))
    assert result == [date(2026, 1, 5)]  # Monday

def test_weekend_shift_next_business_day_sunday():
    e = make_event("one-time", "2026-01-04", weekend_shift="next_business_day")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 1, 31))
    assert result == [date(2026, 1, 5)]  # Monday

def test_weekend_shift_applies_across_recurring_cycles():
    e = make_event("biweekly", "2026-01-03", weekend_shift="next_business_day")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 1, 31))
    assert result == [date(2026, 1, 5), date(2026, 1, 19)]  # both Saturdays shift to Monday

def test_weekend_shift_pulls_occurrence_into_window():
    # Raw anchor (Sat) is before `start`, but shifting forward lands inside the window.
    e = make_event("one-time", "2026-01-03", weekend_shift="next_business_day")
    result = get_occurrences(e, date(2026, 1, 5), date(2026, 1, 31))
    assert result == [date(2026, 1, 5)]

def test_weekend_shift_pushes_occurrence_out_of_window():
    # Raw anchor (Sat) is inside the window, but shifting back lands before `start`.
    e = make_event("one-time", "2026-01-03", weekend_shift="previous_business_day")
    result = get_occurrences(e, date(2026, 1, 3), date(2026, 1, 31))
    assert result == []

def test_next_occurrence_applies_weekend_shift():
    e = make_event("biweekly", "2026-01-03", weekend_shift="next_business_day")
    assert next_occurrence(e, date(2026, 1, 1)) == "2026-01-05"


# ─── get_occurrences: end_date cap ───────────────────────────────────────────

def test_end_date_caps_occurrences():
    e = make_event("monthly", "2026-01-01", end_date="2026-03-31")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 12, 31))
    assert result == [date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1)]

def test_end_date_before_start_returns_empty():
    e = make_event("monthly", "2025-01-01", end_date="2025-12-31")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 6, 30))
    assert result == []


# ─── get_occurrences: inactive ───────────────────────────────────────────────

def test_inactive_event_returns_empty():
    e = make_event("monthly", "2026-01-01", active=False)
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 12, 31))
    assert result == []


# ─── build_calendar ──────────────────────────────────────────────────────────

def test_build_calendar_sorted_by_date_preserving_insertion_order():
    e1 = make_event("monthly", "2026-01-01", id="e1")
    e2 = make_event("monthly", "2026-01-01", id="e2")
    e3 = make_event("monthly", "2026-02-01", id="e3")

    rows = build_calendar([e1, e2, e3], date(2026, 1, 1), date(2026, 2, 28))
    # Jan 1 events should retain insertion order (stable sort, same-day ties)
    jan_rows = [r for r in rows if r["date"] == date(2026, 1, 1)]
    assert jan_rows[0]["id"] == "e1"
    assert jan_rows[1]["id"] == "e2"
    # Feb event last
    assert rows[-1]["date"] == date(2026, 2, 1)

def test_build_calendar_row_fields():
    e = make_event("one-time", "2026-03-15", id="x1", name="My Event",
                   event_type="transfer", from_account_id="hub", to_account_id="loc")
    rows = build_calendar([e], date(2026, 3, 1), date(2026, 3, 31))
    assert len(rows) == 1
    r = rows[0]
    assert r["id"]              == "x1"
    assert r["name"]            == "My Event"
    assert r["type"]            == "transfer"
    assert r["from_account_id"] == "hub"
    assert r["to_account_id"]   == "loc"


# ─── serialization round-trip ─────────────────────────────────────────────────

def _make_state():
    """Minimal fake session-state-like namespace for serialization tests."""
    class NS:
        members  = [Member("A", "Person A")]
        accounts = [Account("chq_a", "Chequing A", "chequing", "A", balance=1000)]
        events   = [make_event("monthly", "2026-01-01", id="e1")]
    return NS()

def test_blueprint_roundtrip():
    ns = _make_state()
    raw = blueprint_to_json(ns)
    result = json_to_blueprint(raw)

    assert len(result["members"])  == 1
    assert len(result["accounts"]) == 1
    assert len(result["events"])   == 1

    assert result["members"][0].id    == "A"
    assert result["accounts"][0].id   == "chq_a"
    assert result["accounts"][0].balance == 1000
    assert result["events"][0].id     == "e1"

def test_blueprint_json_is_valid_json():
    ns = _make_state()
    raw = blueprint_to_json(ns)
    parsed = json.loads(raw)  # should not raise
    assert "accounts" in parsed
    assert "events"   in parsed


# ─── json_to_blueprint: partial / invalid input ──────────────────────────────

def test_json_to_blueprint_missing_keys_defaults_to_empty():
    raw = json.dumps({})
    result = json_to_blueprint(raw)
    assert result["members"]  == []
    assert result["accounts"] == []
    assert result["events"]   == []

def test_json_to_blueprint_partial_keys():
    raw = json.dumps({"accounts": [{"id": "x", "name": "X", "type": "chequing",
                                    "owner": "A", "balance": 0.0,
                                    "interest_rate": 0.0, "notes": ""}]})
    result = json_to_blueprint(raw)
    assert len(result["accounts"]) == 1
    assert result["accounts"][0].id == "x"
    assert result["members"] == []

def test_json_to_blueprint_invalid_json_raises():
    import pytest
    with pytest.raises(json.JSONDecodeError):
        json_to_blueprint("not valid json {{{")


# ─── account/event threshold & execution fields ──────────────────────────────

def test_account_backward_compat_defaults_new_fields_to_none():
    raw = json.dumps({"accounts": [{"id": "x", "name": "X", "type": "chequing",
                                    "owner": "A", "balance": 0.0,
                                    "interest_rate": 0.0, "notes": ""}]})
    acct = json_to_blueprint(raw)["accounts"][0]
    assert acct.target_floor is None
    assert acct.sweep_ceiling is None
    assert acct.sweep_role is None
    assert acct.statement_close_date is None
    assert acct.payment_due_date is None

def test_event_backward_compat_defaults_new_fields():
    raw = json.dumps({"events": [{"id": "e1", "name": "E", "event_type": "outflow",
                                  "amount": 100, "from_account_id": "chq_a",
                                  "to_account_id": None, "frequency": "monthly",
                                  "anchor_date": "2026-01-01"}]})
    ev = json_to_blueprint(raw)["events"][0]
    assert ev.execution == "auto"

def test_account_sweep_fields_roundtrip_on_chequing():
    ns = _make_state()
    ns.accounts[0].target_floor = 500.0
    ns.accounts[0].sweep_ceiling = 2500.0
    ns.accounts[0].sweep_role = "buffer"
    result = json_to_blueprint(blueprint_to_json(ns))
    a = result["accounts"][0]
    assert a.target_floor == 500.0
    assert a.sweep_ceiling == 2500.0
    assert a.sweep_role == "buffer"

def test_account_date_fields_roundtrip_on_debt():
    ns = _make_state()
    ns.accounts = [Account("cc1", "Credit Card", "debt", "A",
                            statement_close_date="2026-08-15", payment_due_date="2026-09-05")]
    result = json_to_blueprint(blueprint_to_json(ns))
    a = result["accounts"][0]
    assert a.statement_close_date == "2026-08-15"
    assert a.payment_due_date == "2026-09-05"

def test_account_export_omits_fields_irrelevant_to_type():
    ns = _make_state()  # chq_a is chequing
    ns.accounts[0].statement_close_date = "2026-08-15"  # not applicable to chequing
    raw = json.loads(blueprint_to_json(ns))
    a = raw["accounts"][0]
    assert "statement_close_date" not in a
    assert "payment_due_date" not in a
    assert "interest_rate" not in a
    assert "market_value" not in a
    assert "target_floor" in a  # sweep fields ARE relevant to chequing

def test_account_import_ignores_legacy_notes_key():
    raw = json.dumps({"accounts": [{"id": "x", "name": "X", "type": "chequing",
                                    "owner": "A", "balance": 0.0, "notes": "old field"}]})
    result = json_to_blueprint(raw)
    assert result["accounts"][0].id == "x"

def test_event_new_fields_roundtrip():
    ns = _make_state()
    ns.events[0].execution = "manual"
    result = json_to_blueprint(blueprint_to_json(ns))
    e = result["events"][0]
    assert e.execution == "manual"

def test_invalid_sweep_role_raises():
    import pytest
    raw = json.dumps({"accounts": [{"id": "x", "name": "X", "type": "chequing",
                                    "owner": "A", "sweep_role": "not_a_role"}]})
    with pytest.raises(ValueError, match="sweep_role"):
        json_to_blueprint(raw)

def test_non_numeric_target_floor_raises():
    import pytest
    raw = json.dumps({"accounts": [{"id": "x", "name": "X", "type": "chequing",
                                    "owner": "A", "target_floor": "lots"}]})
    with pytest.raises(ValueError, match="target_floor"):
        json_to_blueprint(raw)

def test_invalid_execution_raises():
    import pytest
    raw = json.dumps({"events": [{"id": "e1", "name": "E", "event_type": "outflow",
                                  "amount": 100, "from_account_id": "chq_a",
                                  "to_account_id": None, "frequency": "monthly",
                                  "anchor_date": "2026-01-01", "execution": "sometimes"}]})
    with pytest.raises(ValueError, match="execution"):
        json_to_blueprint(raw)

def test_invalid_weekend_shift_raises():
    import pytest
    raw = json.dumps({"events": [{"id": "e1", "name": "E", "event_type": "outflow",
                                  "amount": 100, "from_account_id": "chq_a",
                                  "to_account_id": None, "frequency": "monthly",
                                  "anchor_date": "2026-01-01", "weekend_shift": "whenever"}]})
    with pytest.raises(ValueError, match="weekend_shift"):
        json_to_blueprint(raw)

def test_invalid_statement_close_date_raises():
    import pytest
    raw = json.dumps({"accounts": [{"id": "x", "name": "X", "type": "debt",
                                    "owner": "A", "statement_close_date": "not-a-date"}]})
    with pytest.raises(ValueError, match="statement_close_date"):
        json_to_blueprint(raw)


# ─── get_occurrences: boundary conditions ────────────────────────────────────

def test_anchor_on_start_boundary_included():
    e = make_event("one-time", "2026-03-01")
    result = get_occurrences(e, date(2026, 3, 1), date(2026, 3, 31))
    assert date(2026, 3, 1) in result

def test_anchor_on_end_boundary_included():
    e = make_event("one-time", "2026-03-31")
    result = get_occurrences(e, date(2026, 3, 1), date(2026, 3, 31))
    assert date(2026, 3, 31) in result

def test_single_day_window_matching():
    e = make_event("one-time", "2026-06-15")
    assert get_occurrences(e, date(2026, 6, 15), date(2026, 6, 15)) == [date(2026, 6, 15)]

def test_single_day_window_no_match():
    e = make_event("one-time", "2026-06-16")
    assert get_occurrences(e, date(2026, 6, 15), date(2026, 6, 15)) == []

def test_end_date_on_window_boundary_included():
    # end_date exactly equals the window end — that occurrence should still appear
    e = make_event("monthly", "2026-01-01", end_date="2026-03-01")
    result = get_occurrences(e, date(2026, 1, 1), date(2026, 3, 31))
    assert date(2026, 3, 1) in result
    assert date(2026, 4, 1) not in result


# ─── build_calendar: edge cases ───────────────────────────────────────────────

def test_build_calendar_empty_events():
    assert build_calendar([], date(2026, 1, 1), date(2026, 12, 31)) == []

def test_build_calendar_all_inactive():
    e = make_event("monthly", "2026-01-01", active=False)
    assert build_calendar([e], date(2026, 1, 1), date(2026, 12, 31)) == []


# ─── _build_mermaid ───────────────────────────────────────────────────────────

def _mermaid_state(events, accounts):
    """Patch st.session_state for _build_mermaid calls."""
    st_stub.session_state = types.SimpleNamespace(events=events, accounts=accounts)

def test_mermaid_starts_with_graph_lr():
    _mermaid_state([], [])
    assert _build_mermaid().startswith("graph LR")

def test_mermaid_includes_account_nodes():
    accts = [Account("hub", "Joint Hub", "savings", "Joint")]
    e = make_event("monthly", "2026-01-01", from_account_id="hub", to_account_id=None)
    _mermaid_state([e], accts)
    diagram = _build_mermaid()
    assert "hub" in diagram
    assert '"Joint Hub"' in diagram

def test_mermaid_includes_transfer_edge():
    accts = [
        Account("hub",  "Joint Hub",  "savings",  "Joint"),
        Account("sav1", "Emergency",  "savings",  "Joint"),
    ]
    e = make_event("monthly", "2026-01-01", id="e1", name="Save",
                   amount=500, from_account_id="hub", to_account_id="sav1")
    _mermaid_state([e], accts)
    diagram = _build_mermaid()
    assert "hub --> " in diagram or "hub -->|" in diagram
    assert "sav1" in diagram

def test_mermaid_excludes_inactive_events():
    accts = [
        Account("hub",  "Joint Hub", "savings", "Joint"),
        Account("sav1", "Emergency", "savings", "Joint"),
    ]
    e = make_event("monthly", "2026-01-01", name="Hidden",
                   from_account_id="hub", to_account_id="sav1", active=False)
    _mermaid_state([e], accts)
    diagram = _build_mermaid()
    assert "Hidden" not in diagram

def test_mermaid_sanitizes_hyphens_in_ids():
    accts = [Account("acc-with-hyphens", "Hyphenated", "savings", "A")]
    e = make_event("monthly", "2026-01-01",
                   from_account_id="acc-with-hyphens", to_account_id=None)
    _mermaid_state([e], accts)
    diagram = _build_mermaid()
    assert "acc_with_hyphens" in diagram
    # raw hyphenated form should not appear as a node identifier
    assert "acc-with-hyphens[" not in diagram


# ─── default data integrity ───────────────────────────────────────────────────

def test_default_event_account_refs_exist():
    """Every from/to account ID referenced by default events must exist in default accounts."""
    account_ids = {a.id for a in _default_accounts()}
    for event in _default_events():
        if event.from_account_id is not None:
            assert event.from_account_id in account_ids, (
                f"Event '{event.name}' from_account_id '{event.from_account_id}' not in accounts"
            )
        if event.to_account_id is not None:
            assert event.to_account_id in account_ids, (
                f"Event '{event.name}' to_account_id '{event.to_account_id}' not in accounts"
            )

def test_default_events_have_valid_anchor_dates():
    for event in _default_events():
        d = date.fromisoformat(event.anchor_date)  # raises if malformed
        assert isinstance(d, date)

def test_default_events_have_valid_end_dates():
    for event in _default_events():
        if event.end_date is not None:
            d = date.fromisoformat(event.end_date)
            assert isinstance(d, date)

def test_default_account_ids_unique():
    ids = [a.id for a in _default_accounts()]
    assert len(ids) == len(set(ids)), "Duplicate account IDs in default data"


# ─── project_balances ─────────────────────────────────────────────────────────

def _simple_accounts():
    return [
        Account("chq", "Chequing", "chequing", "A", balance=1000),
        Account("sav", "Savings",  "savings",  "A", balance=500),
        Account("loc", "LOC",      "debt",     "A", balance=200),
    ]

def test_project_inflow_increases_balance():
    accounts = _simple_accounts()
    events   = [make_event("one-time", "2026-04-01", id="e1",
                           event_type="inflow", amount=500,
                           from_account_id=None, to_account_id="chq")]
    df = project_balances(accounts, events, date(2026, 4, 1), date(2026, 4, 3))
    assert df.loc[date(2026, 4, 1), "chq"] == 1500
    assert df.loc[date(2026, 4, 2), "chq"] == 1500  # no further change

def test_project_outflow_decreases_balance():
    accounts = _simple_accounts()
    events   = [make_event("one-time", "2026-04-01", id="e1",
                           event_type="outflow", amount=200,
                           from_account_id="chq", to_account_id=None)]
    df = project_balances(accounts, events, date(2026, 4, 1), date(2026, 4, 2))
    assert df.loc[date(2026, 4, 1), "chq"] == 800

def test_project_transfer_moves_balance():
    accounts = _simple_accounts()
    events   = [make_event("one-time", "2026-04-02", id="e1",
                           event_type="transfer", amount=300,
                           from_account_id="chq", to_account_id="sav")]
    df = project_balances(accounts, events, date(2026, 4, 1), date(2026, 4, 3))
    assert df.loc[date(2026, 4, 1), "chq"] == 1000  # before transfer
    assert df.loc[date(2026, 4, 2), "chq"] == 700
    assert df.loc[date(2026, 4, 2), "sav"] == 800

def test_project_net_worth_column_present():
    accounts = _simple_accounts()
    df = project_balances(accounts, [], date(2026, 4, 1), date(2026, 4, 5))
    assert "Net Worth" in df.columns

def test_project_net_worth_calculation():
    # assets=1000+500=1500, liabilities=200 → net worth=1300
    accounts = _simple_accounts()
    df = project_balances(accounts, [], date(2026, 4, 1), date(2026, 4, 1))
    assert df.loc[date(2026, 4, 1), "Net Worth"] == 1300

def test_project_net_worth_updates_after_debt_payment():
    accounts = _simple_accounts()
    # Transfer 200 from chq to loc (paying off debt)
    events = [make_event("one-time", "2026-04-02", id="e1",
                         event_type="transfer", amount=200,
                         from_account_id="chq", to_account_id="loc")]
    df = project_balances(accounts, events, date(2026, 4, 1), date(2026, 4, 3))
    # Before: chq=1000, sav=500, loc=200 → assets=1500, liab=200 → NW=1300
    assert df.loc[date(2026, 4, 1), "Net Worth"] == 1300
    # After payment: chq=800, sav=500, loc=0 → assets=1300, liab=0 → NW=1300 (flat — net worth unchanged)
    assert df.loc[date(2026, 4, 2), "chq"] == 800
    assert df.loc[date(2026, 4, 2), "loc"] == 0
    assert df.loc[date(2026, 4, 2), "Net Worth"] == 1300

def test_project_index_is_date_range():
    accounts = _simple_accounts()
    df = project_balances(accounts, [], date(2026, 4, 1), date(2026, 4, 5))
    assert len(df) == 5
    assert df.index[0]  == date(2026, 4, 1)
    assert df.index[-1] == date(2026, 4, 5)

def test_project_no_events_balances_unchanged():
    accounts = _simple_accounts()
    df = project_balances(accounts, [], date(2026, 4, 1), date(2026, 4, 7))
    assert (df["chq"] == 1000).all()
    assert (df["sav"] == 500).all()

def test_project_inactive_event_ignored():
    accounts = _simple_accounts()
    events   = [make_event("one-time", "2026-04-03", id="e1",
                           event_type="inflow", amount=9999,
                           from_account_id=None, to_account_id="chq", active=False)]
    df = project_balances(accounts, events, date(2026, 4, 1), date(2026, 4, 5))
    assert (df["chq"] == 1000).all()


# ─── guilt_free_buffers ───────────────────────────────────────────────────────

def test_guilt_free_buffer_basic():
    # A earns $2500 biweekly → ~$5416/mo; pays $400/mo bills + $1500 biweekly hub transfer (~$3250/mo)
    # buffer ≈ 5416 - 400 - 3250 = 1766
    accounts = [
        Account("chq_a", "Chequing A", "chequing", "A", balance=0),
        Account("hub",   "Hub",        "savings",  "Joint", balance=0),
    ]
    events = [
        make_event("biweekly", "2026-01-02", id="e1",
                   event_type="inflow", amount=2500,
                   from_account_id=None, to_account_id="chq_a"),
        make_event("monthly", "2026-01-01", id="e2",
                   event_type="outflow", amount=400,
                   from_account_id="chq_a", to_account_id=None),
        make_event("biweekly", "2026-01-02", id="e3",
                   event_type="transfer", amount=1500,
                   from_account_id="chq_a", to_account_id="hub"),
    ]
    buffers = guilt_free_buffers(accounts, events)
    assert "A" in buffers
    avg_monthly, _ = buffers["A"]
    expected = 2500 * (26 / 12) - 400 - 1500 * (26 / 12)
    assert abs(avg_monthly - expected) < 0.01

def test_guilt_free_buffer_two_owners():
    accounts = [
        Account("chq_a", "Chequing A", "chequing", "A", balance=0),
        Account("chq_b", "Chequing B", "chequing", "B", balance=0),
    ]
    events = [
        make_event("biweekly", "2026-01-02", id="e1",
                   event_type="inflow", amount=2500,
                   from_account_id=None, to_account_id="chq_a"),
        make_event("biweekly", "2026-01-09", id="e2",
                   event_type="inflow", amount=2000,
                   from_account_id=None, to_account_id="chq_b"),
    ]
    buffers = guilt_free_buffers(accounts, events)
    assert "A" in buffers and "B" in buffers
    assert buffers["A"] > buffers["B"]

def test_guilt_free_buffer_ignores_one_time():
    accounts = [Account("chq_a", "Chequing A", "chequing", "A", balance=0)]
    events = [
        make_event("biweekly", "2026-01-02", id="e1",
                   event_type="inflow", amount=2500,
                   from_account_id=None, to_account_id="chq_a"),
        make_event("one-time", "2026-01-15", id="e2",
                   event_type="inflow", amount=99999,
                   from_account_id=None, to_account_id="chq_a"),
    ]
    buffers = guilt_free_buffers(accounts, events)
    # one-time bonus should NOT inflate the buffer
    avg_monthly, _ = buffers["A"]
    expected = 2500 * (26 / 12)
    assert abs(avg_monthly - expected) < 0.01

def test_guilt_free_buffer_ignores_joint_chequing():
    accounts = [
        Account("chq_j", "Joint Chequing", "chequing", "Joint", balance=0),
    ]
    events = [make_event("biweekly", "2026-01-02", id="e1",
                         event_type="inflow", amount=5000,
                         from_account_id=None, to_account_id="chq_j")]
    buffers = guilt_free_buffers(accounts, events)
    assert buffers == {}

def test_guilt_free_buffer_inactive_events_excluded():
    accounts = [Account("chq_a", "Chequing A", "chequing", "A", balance=0)]
    events = [
        make_event("biweekly", "2026-01-02", id="e1",
                   event_type="inflow", amount=2500,
                   from_account_id=None, to_account_id="chq_a"),
        make_event("monthly", "2026-01-01", id="e2",
                   event_type="outflow", amount=9999,
                   from_account_id="chq_a", to_account_id=None, active=False),
    ]
    buffers = guilt_free_buffers(accounts, events)
    avg_monthly, _ = buffers["A"]
    expected = 2500 * (26 / 12)
    assert abs(avg_monthly - expected) < 0.01
