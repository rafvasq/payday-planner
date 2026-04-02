"""
Tests for payday.py pure logic:
  - _advance_month / _advance_quarter
  - get_occurrences (all frequencies, end_date capping, inactive events, boundaries)
  - build_calendar (sorting by date+tier, empty input)
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

# Stub ollama — it's optional and may not be installed in CI
if "ollama" not in sys.modules:
    sys.modules["ollama"] = types.ModuleType("ollama")

from payday_planner.models import Event, Account, Member, AllocationRule, Goal
from payday_planner.engine import (
    _advance_month,
    _advance_quarter,
    get_occurrences,
    build_calendar,
    project_balances,
    guilt_free_buffers,
    blueprint_to_json,
    json_to_blueprint,
    _default_accounts,
    _default_events,
)
from payday_planner.app import extract_blueprint_json, _build_mermaid

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
        amount_type="fixed",
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

def test_build_calendar_sorted_by_date_then_tier():
    e1 = make_event("monthly", "2026-01-01", id="e1", tier=3)
    e2 = make_event("monthly", "2026-01-01", id="e2", tier=1)
    e3 = make_event("monthly", "2026-02-01", id="e3", tier=1)

    rows = build_calendar([e1, e2, e3], date(2026, 1, 1), date(2026, 2, 28))
    # Jan 1 events should be sorted by tier (e2 before e1)
    jan_rows = [r for r in rows if r["date"] == date(2026, 1, 1)]
    assert jan_rows[0]["id"] == "e2"
    assert jan_rows[1]["id"] == "e1"
    # Feb event last
    assert rows[-1]["date"] == date(2026, 2, 1)

def test_build_calendar_row_fields():
    e = make_event("one-time", "2026-03-15", id="x1", name="My Event",
                   event_type="transfer", from_account_id="hub", to_account_id="loc",
                   owner="Joint", tags=["debt"])
    rows = build_calendar([e], date(2026, 3, 1), date(2026, 3, 31))
    assert len(rows) == 1
    r = rows[0]
    assert r["id"]              == "x1"
    assert r["name"]            == "My Event"
    assert r["type"]            == "transfer"
    assert r["from_account_id"] == "hub"
    assert r["to_account_id"]   == "loc"
    assert r["owner"]           == "Joint"
    assert r["tags"]            == ["debt"]


# ─── serialization round-trip ─────────────────────────────────────────────────

def _make_state():
    """Minimal fake session-state-like namespace for serialization tests."""
    class NS:
        members  = [Member("A", "Person A", "#fff")]
        accounts = [Account("chq_a", "Chequing A", "chequing", "A", balance=1000)]
        events   = [make_event("monthly", "2026-01-01", id="e1")]
        rules    = [AllocationRule("r1", "Rule 1", 1, "percentage", 50, "hub", "sav1")]
        goals    = [Goal("g1", "Goal 1", "sav1", 5000, "2026-12-31")]
    return NS()

def test_blueprint_roundtrip():
    ns = _make_state()
    raw = blueprint_to_json(ns)
    result = json_to_blueprint(raw)

    assert len(result["members"])  == 1
    assert len(result["accounts"]) == 1
    assert len(result["events"])   == 1
    assert len(result["rules"])    == 1
    assert len(result["goals"])    == 1

    assert result["members"][0].id    == "A"
    assert result["accounts"][0].id   == "chq_a"
    assert result["accounts"][0].balance == 1000
    assert result["events"][0].id     == "e1"
    assert result["rules"][0].amount  == 50
    assert result["goals"][0].target_balance == 5000

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
    assert result["rules"]    == []
    assert result["goals"]    == []

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
                   from_account_id=None, to_account_id="chq_a", owner="A"),
        make_event("monthly", "2026-01-01", id="e2",
                   event_type="outflow", amount=400,
                   from_account_id="chq_a", to_account_id=None, owner="A"),
        make_event("biweekly", "2026-01-02", id="e3",
                   event_type="transfer", amount=1500,
                   from_account_id="chq_a", to_account_id="hub", owner="A"),
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
                   from_account_id=None, to_account_id="chq_a", owner="A"),
        make_event("biweekly", "2026-01-09", id="e2",
                   event_type="inflow", amount=2000,
                   from_account_id=None, to_account_id="chq_b", owner="B"),
    ]
    buffers = guilt_free_buffers(accounts, events)
    assert "A" in buffers and "B" in buffers
    assert buffers["A"] > buffers["B"]

def test_guilt_free_buffer_ignores_one_time():
    accounts = [Account("chq_a", "Chequing A", "chequing", "A", balance=0)]
    events = [
        make_event("biweekly", "2026-01-02", id="e1",
                   event_type="inflow", amount=2500,
                   from_account_id=None, to_account_id="chq_a", owner="A"),
        make_event("one-time", "2026-01-15", id="e2",
                   event_type="inflow", amount=99999,
                   from_account_id=None, to_account_id="chq_a", owner="A"),
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
                         from_account_id=None, to_account_id="chq_j", owner="Joint")]
    buffers = guilt_free_buffers(accounts, events)
    assert buffers == {}

def test_guilt_free_buffer_inactive_events_excluded():
    accounts = [Account("chq_a", "Chequing A", "chequing", "A", balance=0)]
    events = [
        make_event("biweekly", "2026-01-02", id="e1",
                   event_type="inflow", amount=2500,
                   from_account_id=None, to_account_id="chq_a", owner="A"),
        make_event("monthly", "2026-01-01", id="e2",
                   event_type="outflow", amount=9999,
                   from_account_id="chq_a", to_account_id=None, owner="A", active=False),
    ]
    buffers = guilt_free_buffers(accounts, events)
    avg_monthly, _ = buffers["A"]
    expected = 2500 * (26 / 12)
    assert abs(avg_monthly - expected) < 0.01


# ─── extract_blueprint_json ───────────────────────────────────────────────────

_CAR_FUND_RESPONSE = """\
Sure! Here is your updated blueprint with the new Car Fund event added.

```json
{
  "members": [{"id": "A", "name": "Person A", "color": "#4A90D9"},
              {"id": "B", "name": "Person B", "color": "#E91E8C"}],
  "accounts": [{"id": "hub",  "name": "Joint Hub",  "type": "savings",
                "owner": "Joint", "balance": 0, "interest_rate": 0, "notes": ""},
               {"id": "sav2", "name": "Goals Fund", "type": "savings",
                "owner": "Joint", "balance": 0, "interest_rate": 0, "notes": ""}],
  "events": [
    {"id": "new-car-fund-id", "name": "Car Fund", "event_type": "transfer",
     "amount": 150, "amount_type": "fixed",
     "from_account_id": "hub", "to_account_id": "sav2",
     "frequency": "monthly", "anchor_date": "2026-05-01", "end_date": null,
     "owner": "Joint", "tier": 4, "tags": ["savings"], "notes": "", "active": true}
  ],
  "rules": [],
  "goals": []
}
```

The Car Fund event will transfer $150 from the Joint Hub to the Goals Fund on the 1st of each month.
"""

def test_extract_blueprint_json_returns_json_block():
    raw = extract_blueprint_json(_CAR_FUND_RESPONSE)
    assert raw is not None
    parsed = json.loads(raw)   # valid JSON
    assert "events" in parsed

def test_extract_blueprint_json_no_block_returns_none():
    assert extract_blueprint_json("Here is my answer with no code block.") is None

def test_extract_blueprint_json_preserves_content():
    raw = extract_blueprint_json(_CAR_FUND_RESPONSE)
    parsed = json.loads(raw)
    assert parsed["events"][0]["name"] == "Car Fund"
    assert parsed["events"][0]["amount"] == 150

def test_oracle_update_car_fund_end_to_end():
    """
    Simulate the full Oracle update flow:
    parse response → deserialize → verify the new event is present
    with correct account IDs and frequency.
    """
    raw    = extract_blueprint_json(_CAR_FUND_RESPONSE)
    result = json_to_blueprint(raw)

    car_fund = next((e for e in result["events"] if e.name == "Car Fund"), None)
    assert car_fund is not None,                          "Car Fund event missing after apply"
    assert car_fund.event_type      == "transfer"
    assert car_fund.amount          == 150
    assert car_fund.from_account_id == "hub"
    assert car_fund.to_account_id   == "sav2"
    assert car_fund.frequency       == "monthly"
    assert car_fund.active          is True

def test_oracle_update_car_fund_appears_in_projection():
    """After applying the update, Car Fund should show up in build_calendar."""
    raw    = extract_blueprint_json(_CAR_FUND_RESPONSE)
    result = json_to_blueprint(raw)

    cal = build_calendar(result["events"], date(2026, 5, 1), date(2026, 7, 31))
    car_fund_rows = [r for r in cal if r["name"] == "Car Fund"]
    assert len(car_fund_rows) == 3                        # May, Jun, Jul
    assert all(r["from_account_id"] == "hub"  for r in car_fund_rows)
    assert all(r["to_account_id"]   == "sav2" for r in car_fund_rows)
    assert all(r["amount"]          == 150    for r in car_fund_rows)
