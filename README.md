# Payday Planner 💸

A modern, local-first web application for household financial modeling and cashflow forecasting. 

Model your income, recurring bills, mortgages, and transfers to simulate your daily balances up to 180 days into the future. Generate LLM-optimized blueprints and analyze your spending habits securely. Your data never leaves your computer.

---

## ✨ Core Features

- 📈 **Cashflow Projections**: Simulate your balances and view interactive Recharts timelines tracking Net Worth, Liquid Assets, and Debt.
- 🚨 **Smart Alerts**: Automatically flag critical overdraft risks and target floor dips into readable "Alert Episodes".
- 💸 **Spending Analysis**: Drag-and-drop credit card CSVs (AMEX, Rogers, PC Financial, Tangerine) to instantly clean, aggregate, and format your transactions for LLM-assisted budget reviews.
- ⚡ **LLM Integration**: Update live balances and instantly copy a minified JSON blueprint (along with spending data) to feed directly into ChatGPT or Claude for personal financial advice.
- 🎨 **Money Flow Diagrams**: Auto-generate interactive Mermaid architecture diagrams of your entire household cashflow.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rafvasq/payday-planner.git
   cd payday-planner
   ```

2. Install dependencies & run:
   ```bash
   npm install
   npm run dev
   ```

3. Open your browser at `http://localhost:5173`. Alternatively, use your local `start_payday.bat` shortcut on Windows.

---

## 🔒 Security & Privacy

- **100% Local**: All computations and storage happen entirely in your local browser (`localStorage`). No external APIs or servers.
- **Git Safety**: `.gitignore` strictly protects your personal `*.blueprint.json` backups and local start scripts.

---

## 📄 License

MIT License. See [LICENSE](file:///c:/Users/Rafael/workspace/repos/payday-planner/LICENSE) for details.
