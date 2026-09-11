# Payday Planner 💸

A modern, local-first web application for household financial modeling, cashflow forecasting, and automated balance projections. 

Model your household income, recurring bills, mortgages, and transfers, and simulate daily balances 30 to 180 days into the future — complete with **episode-based overdraft alerts**, **guilt-free spending buffers**, **automated JSON timestamping**, and **interactive money flow diagrams**.

Runs 100% locally in your browser — your data never leaves your computer.

---

## ✨ Features

- 📈 **Cashflow & Balance Projections**
  - Daily balance simulation forward over 30, 60, 90, or 180 days.
  - Interactive Recharts timeline tracking Net Worth, Liquid Assets, Total Debt, Real Estate Equity, or individual accounts.
  - **Same-Day Cleared Transaction Guard**: Toggle option to prevent double-counting transactions on days when live balances already reflect cleared events.

- 🚨 **Episode-Based Overdraft & Floor Alerts**
  - Smart alert grouping: Groups consecutive daily dips into clean, contiguous **Alert Episodes** (e.g. `Sep 18 – Sep 30 (13 days)`).
  - Categorizes **Critical Overdraft Risks** (`balance < $0`) separately from **Target Floor Dip Warnings** (`$0 <= balance < target_floor`).

- ⚡ **Payday Quick Check-In**
  - Update all live account balances in 15 seconds via a sleek modal overlay.
  - One-click copy of the minified JSON blueprint for instant LLM prompt context.

- 🛡️ **LLM-Optimized Blueprint JSON (`current_date`)**
  - Injects top-level `"current_date": "YYYY-MM-DD"` timestamp automatically into exported blueprints so LLMs instantly recognize the exact reference snapshot date.

- 🎨 **Interactive Money Flow Architecture**
  - Auto-generated Mermaid diagram categorized into structured subgraphs (*Incomes*, *Member Accounts*, *Joint Hub*, *Bills & Mortgages*).
  - Color-coded node themes and direction toggle (Horizontal `LR` vs Vertical `TD`).

- 💰 **Guilt-Free Spending Buffer**
  - Calculates true discretionary spending capacity per household member after all recurring outflows and hub commitments are fulfilled.

- 🔄 **Sparse Backup & Restore**
  - Import/Export clean minified JSON blueprints, export accounts/events to CSV, or download Mermaid flow markdown.

---

## 🛠️ Stack & Architecture

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **State Management**: Zustand
- **Charting & Visualizations**: Recharts, Mermaid
- **Icons**: Lucide React
- **Validation**: Zod
- **Testing**: Vitest (100% green test suite)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation & Run

1. Clone the repository:
   ```bash
   git clone https://github.com/rafvasq/payday-planner.git
   cd payday-planner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Open your browser at `http://localhost:5173`.

---

## 🧪 Testing & Verification

Run the automated Vitest test suite:

```bash
npm test
```

Run TypeScript compilation checks:

```bash
npx tsc --noEmit
```

---

## 📋 Data Structure & Concepts

### Accounts
Accounts represent your financial containers (chequing, savings, debt, investment, liability):

| Type | Description |
| :--- | :--- |
| `chequing` | Day-to-day spending account |
| `savings` | Savings or emergency fund |
| `investment` | RRSP, TFSA, brokerage, etc. |
| `debt` | Line of credit, credit card |
| `liability` | Mortgage or long-term liability |

Each account carries only the fields relevant to its type (`target_floor` for cash management, `interest_rate` / `market_value` for mortgages/real estate equity).

### Events
Events power the cashflow engine:
- **Event Types**: `inflow` (income), `outflow` (expenses/mortgages), `transfer` (internal movements).
- **Frequencies**: `one-time`, `weekly`, `biweekly`, `biweekly-offset`, `monthly`, `quarterly`, `annual`.
- **Weekend Shift Rules**: `none`, `previous_business_day`, `next_business_day`.
- **Clearing Days**: Simulates inter-bank settlement delays (e.g. 3 business days for transfer settlement).

---

## 🔒 Security & Privacy

- **100% Local Execution**: All computations and storage happen in your local browser (`localStorage`). No external APIs, trackers, or servers are called.
- **Git Safety**: `.gitignore` strictly ignores local scratch scripts (`scratch/`), temporary data directories, and personal `*.blueprint.json` backup files.

---

## 📄 License

MIT License. See [LICENSE](file:///c:/Users/Rafael/workspace/repos/payday-planner/LICENSE) for details.
