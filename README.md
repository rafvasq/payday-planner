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

- **Dashboard** — Net worth snapshot, per-person guilt-free spending buffers, account balances, 90-day cashflow projection chart, and a 14-day upcoming events checklist
- **Accounts** — Track chequing, savings, debt, investment, and liability accounts with balances and ownership
- **Events** — Define recurring or one-time money movements (inflows, outflows, transfers) with flexible frequencies and optional end dates
- **Timeline** — Browse all upcoming events in a calendar view
- **Flow Diagram** — Auto-generated Mermaid diagram showing how money moves between accounts
- **Export / Import** — JSON blueprint for full backup/restore, plus CSV export and Mermaid diagram download

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

### Events

Events are the engine of the app. Each event is a recurring or one-time money movement:

| Field           | Description                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Type**        | `inflow` (money in), `outflow` (money out), `transfer` (between accounts)                       |
| **Frequency**   | `one-time`, `weekly`, `biweekly`, `monthly`, `quarterly`                                        |
| **Anchor Date** | The first occurrence — all future dates are derived from this                                   |
| **End Date**    | Optional — set for temporary events like a debt payoff installment                              |

### Guilt-Free Buffer

The guilt-free buffer is the monthly amount left in each person's chequing account after all committed recurring spending — bills, transfers to the hub, and debt payments. It represents discretionary money that can be spent freely or added to savings without guilt.

Calculated as:

```
buffer = (recurring inflows into your chequing) − (recurring outflows + transfers out of your chequing)
```

One-time events are excluded — only true recurring commitments count.

### Cashflow Projection

The **Dashboard** projects all account balances day-by-day for up to 365 days. The **Net Worth** tab shows total assets minus liabilities over time. The **By Account** tab lets you compare individual account trajectories.

Transfers to debt or liability accounts correctly *reduce* what is owed (e.g. a LOC payment lowers the LOC balance, keeping net worth flat).

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
  engine.py    # Calendar, projection, serialization, guilt-free buffer logic
  models.py    # Data models (Member, Account, Event, Goal)
  cli.py       # Entry point
tests/
  test_payday.py
pyproject.toml
```
