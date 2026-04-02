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
- **Timeline** — Browse all upcoming events in a calendar view, filterable by owner
- **Flow Diagram** — Auto-generated Mermaid diagram showing how money moves between accounts
- **Oracle** — AI assistant (Gemini or Ollama) with full context of your setup; can answer questions and propose blueprint updates
- **Export / Import** — JSON blueprint for full backup/restore, plus CSV export and Mermaid diagram download

---

## Your Data

Your financial blueprint is stored locally at:

- **macOS:** `~/Library/Application Support/payday/blueprint.json`
- **Linux:** `~/.local/share/payday/blueprint.json`
- **Windows:** `%APPDATA%\payday\blueprint.json`

It auto-saves on every page render and auto-loads on startup. To point at a different file:

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
| **Tier**        | Priority order (1 = income, 2 = fixed bills, 3 = hub transfers, 4 = joint expenses, 5 = goals)  |

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

## Oracle (AI Assistant)

The Oracle has full context of your blueprint and can:

- Answer questions about your cash flow ("When does the LOC get paid off?")
- Generate payday checklists ("What do I do on Jan 10th?")
- Propose blueprint updates ("Add a $200/month car fund transfer from Hub to Savings")

When the Oracle suggests a blueprint change, a preview banner appears at the top of the page. Review the JSON diff and click **Apply Update** to accept it.

### Backends

| Backend | Setup |
|---------|-------|
| **Gemini** | Get a free API key at [aistudio.google.com](https://aistudio.google.com), paste it into the sidebar |
| **Ollama** | Install [Ollama](https://ollama.com), run `ollama pull qwen2.5:7b`, select it in the sidebar |

---

## Development

```bash
git clone https://github.com/your-username/payday
cd payday
uv sync
uv tool install .
```

Run tests:

```bash
uv run pytest tests/ -v
```

### Project Structure

```
src/payday/
  app.py       # Streamlit UI
  engine.py    # Calendar, projection, serialization, guilt-free buffer logic
  models.py    # Data models (Member, Account, Event, AllocationRule, Goal)
  cli.py       # Entry point
tests/
  test_payday.py
pyproject.toml
```
