# Payday Planner 💸

A modern, local-first web application for household financial modeling and cashflow forecasting, powered by an onboard AI extraction engine.

Model your income, recurring bills, mortgages, and transfers to simulate your daily balances up to 180 days into the future. Generate LLM-optimized blueprints, natively parse your CSV statements using the AI engine, and analyze your spending habits with an omniscient in-app assistant.

---

## ✨ Core Features

- 📈 **Cashflow Projections**: Simulate your balances and view interactive Recharts timelines tracking Net Worth, Liquid Assets, and Debt.
- 🚨 **Smart Alerts**: Automatically flag critical overdraft risks and target floor dips into readable "Alert Episodes".
- 🤖 **AI-Powered CSV Extraction**: Forget brittle bank profiles. Drag-and-drop any bank CSV, and the AI Extraction Engine will natively parse, clean, and aggregate your transactions into a unified format.
- 💬 **Omniscient AI Assistant**: Chat with a built-in financial advisor that holds your live JSON blueprint and recent spending summaries in its context. Get instant feedback on budget constraints and hypothetical purchases right inside the app.
- 🧠 **Bring Your Own Model (BYOM)**: Built-in Provider Hub. Connect to a local Ollama instance for 100% private local processing, or plug in your API keys for OpenAI, Anthropic, and Google Gemini.
- 🎨 **Money Flow Diagrams**: Auto-generate interactive Mermaid architecture diagrams of your entire household cashflow.

---

## 🏗️ Architecture

Payday Planner is split into a lightning-fast React frontend and a Python backend to handle LLM orchestration.
- **Frontend**: React + Vite + Tailwind CSS + Zustand
- **Backend**: Python + FastAPI + LiteLLM

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- npm or yarn
- (Optional) [Ollama](https://ollama.com) running locally for 100% private offline AI parsing.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rafvasq/payday-planner.git
   cd payday-planner
   ```

2. **Start the FastAPI Backend:**
   ```bash
   cd backend
   python -m venv venv
   # On Windows: venv\Scripts\activate
   # On Mac/Linux: source venv/bin/activate
   pip install -e .
   uvicorn app.main:app --reload
   ```

3. **Start the Vite Frontend:**
   Open a new terminal window at the project root (`payday-planner/`):
   ```bash
   npm install
   npm run dev
   ```

4. **Access the App:**
   Open your browser at `http://localhost:5173`. 
   *Head to the **Settings** (Provider Hub) to configure your desired AI model.*

---

## 🔒 Security & Privacy

- **Local-First Configurations**: Your financial blueprints are stored securely in your browser's `localStorage`.
- **Secure Key Storage**: Cloud API keys (OpenAI, Anthropic, Gemini) are stored securely in your operating system's native credential manager (via `keyring`), not in plain text.
- **Git Safety**: `.gitignore` strictly protects your personal `.env` files and `.blueprint.json` backups.

---

## 📄 License

MIT License. See [LICENSE](./LICENSE) for details.
