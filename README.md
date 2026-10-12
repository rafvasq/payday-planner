# Payday Planner

A local-first application for cashflow forecasting and household financial modeling. It projects account balances over time, tracks scheduled bills and income events, and provides LLM-assisted transaction parsing and plan simulations.

## Features

- **Cashflow Projections**: Calculates daily balances across accounts up to 180 days ahead, tracking net worth, liquid balances, debt, and floor breach risks.
- **Event Scheduling & Checklist**: Manages recurring income, expenses, debt payments, and transfers with date execution tracking.
- **CSV Statement Parsing**: Parses and categorizes bank transaction CSV files using LLM-assisted extraction.
- **Chat Interface & Scenario Simulation**: Conversational interface with tool calling (`simulate`, `propose_blueprint_changes`) to evaluate hypotheticals, compare projection diffs, and apply changes with undo support.
- **Model Providers**: Supports local models via Ollama as well as OpenAI, Anthropic, Google Gemini, and OpenRouter.
- **Cashflow Diagrams**: Visualizes household account and transfer topologies using Mermaid.

## Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand, Recharts.
- **Backend**: Python 3.10+, FastAPI, LiteLLM, Keyring, Pydantic.

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+

### Backend Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -e .
uvicorn app.main:app --reload
```

The backend runs on `http://localhost:8000`.

### Frontend Setup

In a separate terminal at the project root:

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`. Configure provider credentials under the Provider Settings view.

### Running Tests

Frontend:
```bash
npm test
```

Backend:
```bash
pytest backend/tests
```

Production build:
```bash
npm run build
```

## Security & Storage

- Plan blueprints and application state are stored in the browser's `localStorage`.
- Provider API keys are stored in the operating system's native credential manager via `keyring` and are not written to disk files or transmitted back to the client.
- Local API requests are guarded by an `X-Local-Auth-Token` header.

## License

MIT License. See [LICENSE](./LICENSE) for details.
