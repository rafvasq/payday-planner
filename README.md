# Payday 💸

A local-first cashflow planning app. Model your household income, bills, and transfers as recurring events, then project balances and guilt-free spending buffers weeks into the future.

Runs in your browser via a local server — launch it with `payday`, close the tab when you're done. Your data stays on your machine.

---

## Install

```bash
pip install payday-planner
```

Or with [uv](https://github.com/astral-sh/uv):

```bash
uv tool install payday-planner
```

Then run it from anywhere:

```bash
payday
```

The app opens at `http://localhost:8501`. On first launch it loads a demo setup — your data auto-saves between sessions once you configure your own blueprint.

---

## Features

- **Dashboard** — Net worth snapshot, biweekly cashflow summary, per-person guilt-free spending buffers, account balances by type, and a 14-day upcoming events checklist
- **Accounts** — Track chequing, savings, debt, investment, and liability accounts, each carrying only the fields relevant to its type (sweep thresholds for cash accounts, billing dates for debt, market value for mortgages — see [Account Fields by Type](#account-fields-by-type))
- **Events** — Define recurring or one-time money movements (inflows, outflows, transfers) with flexible frequencies, optional end dates, an execution type (auto vs. manual), and weekend-shift handling for dates that land on a Saturday/Sunday
- **Timeline** — Browse all upcoming events in a calendar view
- **Flow Diagram** — Auto-generated Mermaid diagram showing how money moves between accounts
- **Export / Import** — Sparse JSON blueprint for full backup/restore (only fields relevant to each account's type are included), plus CSV export and Mermaid diagram download

---

## Your Data

Your financial blueprint is stored in `payday/blueprint.json`. It auto-saves on every page render and auto-loads on startup. To point at a different file:

```bash
PAYDAY_BLUEPRINT=~/Documents/finances.json payday
```

---

## Concepts

### Accounts

Each account has a **type** and an **owner**:

| Type        | Description                          |
| ----------- | ------------------------------------ |
| `chequing`  | Day-to-day spending account          |
| `savings`   | Savings or emergency fund            |
| `investment`| RRSP, TFSA, brokerage, etc.          |
| `debt`      | Line of credit, credit card          |
| `liability` | Mortgage or other long-term liability|

| Owner   | Description    |
| ------- | -------------- |
| `A`     | Person A       |
| `B`     | Person B       |
| `Joint` | Shared account |

#### Account Fields by Type

Every account always has `id`, `name`, `type`, `owner`, and `balance`. Beyond that, the exported JSON blueprint is **sparse** — each account only carries the fields relevant to its type:

| Type | Also carries |
| - | - |
| `chequing` | `target_floor`, `sweep_ceiling`, `sweep_role` |
| `savings` | `interest_rate`, `target_floor`, `sweep_ceiling`, `sweep_role` |
| `investment` | `target_floor`, `sweep_ceiling`, `sweep_role` |
| `debt` | `statement_close_date`, `payment_due_date` |
| `liability` | `interest_rate`, `market_value`, `statement_close_date`, `payment_due_date` |

A chequing account never has a `market_value` key; a credit card never has `target_floor`. Field meanings:

| Field | Meaning |
| - | - |
| `target_floor` | Minimum balance to keep in this account |
| `sweep_ceiling` | Balance above which surplus is safe to sweep out |
| `sweep_role` | `buffer` (ok to draw from in a pinch) or `restricted` (never sweep) |
| `statement_close_date` / `payment_due_date` | ISO dates for a debt account's billing cycle |
| `interest_rate` | Percentage — informational only, not used in any calculation |
| `market_value` | For liability accounts, the estimated value of the underlying asset (used to compute real estate equity) |

### Events

Events are the engine of the app. Each event is a recurring or one-time money movement:

| Field | Description |
| - | - |
| **Type** | `inflow` (money in), `outflow` (money out), `transfer` (between accounts) |
| **Frequency** | `one-time`, `weekly`, `biweekly`, `biweekly-offset`, `monthly`, `quarterly`. `biweekly-offset` behaves identically to `biweekly` — it's just a distinct label for phasing a second biweekly cycle, like a partner's paycheck, against a different anchor date |
| **Anchor Date** | The first occurrence — all future dates are derived from this |
| **End Date** | Optional. Once passed, the event stops generating occurrences in projections — regardless of whether **Active** is still checked |
| **Execution** | `auto` (the bank moves it on its own) or `manual` (you make the transfer yourself) |
| **Weekend Shift** | `none`, `previous_business_day`, or `next_business_day` — how the date moves when a cycle lands on a Saturday/Sunday |

### Guilt-Free Buffer

The guilt-free buffer is the monthly amount left in each person's chequing account after all committed recurring spending — bills, transfers to the hub, and debt payments. It represents discretionary money that can be spent freely or added to savings without guilt.

Calculated as:

```
buffer = (recurring inflows into your chequing) − (recurring outflows + transfers out of your chequing)
```

One-time events are excluded — only true recurring commitments count.

### Cashflow Projection

`engine.py` includes a day-by-day balance projection (`project_balances`) that simulates every event forward over a date range and returns a running balance per account plus a synthetic Net Worth column. Transfers to debt or liability accounts correctly *reduce* what is owed rather than increasing the balance (e.g. a LOC payment lowers the LOC balance, keeping net worth flat).

This isn't wired into a Dashboard chart yet — today it's exercised by the test suite and available to call directly if you're scripting against the engine. The **Dashboard** itself shows current balances and a 14-day checklist (see Features above); the **Timeline** page lets you browse a wider date range of upcoming events, but doesn't project balances forward.

---

## Development

```bash
git clone https://github.com/rafvasq/payday-planner
cd payday-planner
uv sync
uv tool install .
```

Run tests:

```bash
uv run pytest tests/ -v
```

### Project Structure

```
src/payday_planner/
  app.py       # Streamlit UI
  engine.py    # Calendar, projection, serialization, validation, guilt-free buffer logic
  models.py    # Data models (Member, Account, Event)
  cli.py       # Entry point
tests/
  test_payday.py
pyproject.toml
```
