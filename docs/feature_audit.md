# Payday Planner — Feature Document

> **Last updated:** 2026-09-30
>
> This document defines what Payday Planner is, who it's for, and every feature it ships — both existing (Product A) and planned (Product B).

---

## Ethos

Payday Planner is not a traditional budgeting app. It is an **AI-native financial modeling tool for technical power users.**

1. **AI as the Processing Engine, Not an Add-on.** Instead of writing thousands of lines of hard-coded logic to categorize transactions or predict spending, the app treats LLMs as the core computing engine. The app's job is to provide the perfect context.
2. **Radically Lean & Opinion-Free.** No forced double-entry bookkeeping, no zero-based envelope micromanagement. It extracts messy real-world data and structures it for high-level insight.
3. **Built for Power Users (BYO-Intelligence).** It assumes the user is technical. It exposes raw structured data (JSON blueprints, Mermaid architecture diagrams) and lets users bring their own intelligence — whether that's a local Ollama instance, a cloud API key, or a custom Python script.
4. **Local & Sovereign.** Financial data is hyper-sensitive. The app runs entirely in a local, user-controlled environment with zero forced cloud syncing. API keys are stored locally and never proxied.
5. **Focus on the Future, Not the Past.** While other apps focus on what you spent last month, Payday Planner answers: *"What will my balance be in 90 days if I make this decision?"*

---

## Systemic Biases (Product A → Product B)

These are hardcoded assumptions from Product A that must become configurable for Product B.

| Bias | Current State (Product A) | Target State (Product B) |
| :--- | :--- | :--- |
| 🇨🇦 **Canadian-only** | `models.ts` requires `'chequing'`. `bankProfiles.ts` only knows 4 Canadian banks. `csvParser.ts` cleans `Amazon.ca*` patterns. | Accept both `'chequing'` and `'checking'`. Bank-agnostic document parsing via Docling replaces hardcoded profiles. Merchant cleaning generalizes. |
| 👫 **2-person household** | Flow diagram hardcodes Member 1 / Member 2. Buffer calculator excludes `'Joint'` by string match. Dashboard checks `to_account_id === 'hub'`. | Dynamic member count. Flow diagram generates subgraphs from any number of members. Buffer calculator works for singles, couples, and families. |
| 💰 **Biweekly payday** | `buffer.ts` and `Dashboard.tsx` use `12/26` multiplier. Dashboard cards show `$/payday`. | Pay frequency becomes a user preference. Multipliers compute dynamically from the user's configured frequency. |
| 📋 **Manual LLM workflow** | `prompt.ts` generates clipboard text. No API calls anywhere. | Clipboard remains as a permanent fallback. New provider management enables optional direct API integration (Ollama, OpenAI, Anthropic, Gemini). |

---

## Existing Features

### 1. 📈 Balance Projection Engine
**Status: ✅ KEEP — core differentiator**

**Files:** [`projection.ts`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/core/projection.ts), [`ProjectionChart.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/ProjectionChart.tsx)

**What it does:** Day-by-day cashflow simulation over 30/60/90/180 days. Computes daily Net Worth, Liquid Assets, Real Estate Equity, and Debt. Generates overdraft alerts and target-floor dip warnings, grouped into readable "Alert Episodes" with duration, start/end dates, and minimum balance.

**Product B evolution:**
- Gets its own dedicated view at `/planner/projections` (currently only embedded in Dashboard)
- Custom date range picker (not just preset windows)
- Per-account toggle panel (show/hide individual lines)
- Future: "what-if" scenario comparisons, holiday awareness

---

### 2. 💸 Guilt-Free Buffer Calculator
**Status: ✅ KEEP — high emotional value**

**Files:** [`buffer.ts`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/core/buffer.ts), hero cards in [`Dashboard.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/Dashboard.tsx)

**What it does:** Calculates safe discretionary spending per member by aggregating monthly recurring income minus bills/transfers, then normalizing to a per-payday amount. Displays as hero "Guilt-Free Personal Allowance" cards on the Dashboard.

**Product B evolution:**
- Decouple from `'Joint'` string match and `'hub'` account ID
- Replace hardcoded `12/26` biweekly constant with user's configured pay frequency
- Support single-person households (no joint exclusion)

---

### 3. 📅 Timeline Checklist
**Status: ✅ KEEP**

**Files:** [`calendar.ts`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/core/calendar.ts), [`TimelineChecklist.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/TimelineChecklist.tsx)

**What it does:** 8-week chronological agenda with collapsible date panels. Auto-expands paydays. Interactive checkboxes to mark bills as executed/paid, persisted in localStorage. Highlights manual payments with a badge.

**Product B evolution:**
- Migrate accordion to shadcn `Collapsible` components
- Accessible checkbox states via Radix primitives

---

### 4. ⚡ Quick Check-In Modal
**Status: ✅ KEEP — signature UX interaction**

**Files:** [`QuickCheckInModal.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/QuickCheckInModal.tsx)

**What it does:** 15-second rapid balance entry for all accounts. Toggle for "balances reflect today's cleared transactions." Freeform notes textarea for LLM context. One button: save + copy prompt + auto-dismiss (1.2s).

**Product B evolution:**
- When an LLM provider is configured, "Save & Copy" gains a companion action: "Save & Analyze" which sends the prompt directly to the active provider and surfaces the response in-app
- Migrate modal to shadcn `Dialog`

---

### 5. 🔀 Money Flow Diagram
**Status: ⚠️ EVOLVE**

**Files:** [`FlowDiagram.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/FlowDiagram.tsx)

**What it does:** Auto-generates a Mermaid.js architecture diagram of household cashflow. Partitions into Inflows → Member 1 → Member 2 → Joint Hub → Outflows with annotated transfer arrows. Supports LR/TD orientation, copying Mermaid code, and downloading as markdown.

**What's wrong:** Hardcodes `members[0]` / `members[1]` and uses original author variable names (`rAccts`, `jAccts`). Breaks for singles or 3+ member households.

**Product B evolution:**
- Dynamically generate subgraphs from any number of members
- Remove hardcoded variable names and index assumptions
- Handle single-person households (no joint partition)

---

### 6. 🏦 CSV Bank Parser & Spending Analysis
**Status: ⚠️ EVOLVE → replaced by bank-agnostic pipeline (see New Feature #1)**

**Files:** [`bankProfiles.ts`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/core/bankProfiles.ts), [`csvParser.ts`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/core/csvParser.ts), [`AnalysisTab.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/AnalysisTab.tsx)

**What it does:** Drag-and-drop CSV import. Auto-detects bank via header signatures (AMEX Canada, Rogers, PC Financial, Tangerine). Cleans merchant names, aggregates spending into Markdown tables, generates LLM analysis prompt.

**Product B evolution:**
- Existing CSV profiles become a **fast path** — if a CSV matches a known profile, parse deterministically (no LLM cost)
- Unknown CSVs and all PDFs route through the new Docling + LLM pipeline (see New Feature #1)
- Drop zone accepts PDFs in addition to CSVs
- Analysis results display in-app instead of only via clipboard

---

### 7. 📋 LLM Prompt Generator
**Status: ⚠️ EVOLVE → becomes one of multiple AI interaction modes**

**Files:** [`prompt.ts`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/core/prompt.ts), [`serialization.ts`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/core/serialization.ts)

**What it does:** Compiles a token-optimized JSON blueprint + structured English prompt. Compresses UUIDs to short tokens (`a1`, `e1`) to save context window. Copies to clipboard for manual paste into ChatGPT/Claude/Gemini.

**Product B evolution:**
- Clipboard copy remains as a permanent fallback ("Prompt Export" view)
- When an LLM provider is configured, the same prompt is sent directly via API
- Blueprint serialization becomes the shared context layer for all AI features (Chat, Analysis, Check-In)

---

### 8. 💾 Export / Import
**Status: ✅ KEEP**

**Files:** [`ExportImport.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/ExportImport.tsx), [`serialization.ts`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/core/serialization.ts)

**What it does:** JSON export (formatted/minified/compressed). JSON import with Zod schema validation and 5MB limit. CSV table downloads for accounts and events. Factory reset.

**Product B evolution:**
- Factory reset offers multiple starter templates (Single, Couple, Family) instead of hardcoding the 2-person Canadian household
- Factory reset moves to Settings view
- Backup/snapshot management becomes its own view (see New Feature #7)

---

### 9. 🏠 Accounts & Members Manager
**Status: ✅ KEEP**

**Files:** [`AccountsManager.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/AccountsManager.tsx)

**What it does:** Aggregate metric cards (Liquid Assets, Debt, Net Worth). Member renaming. Add/edit/delete accounts with inline auto-save on blur. Grouped by type (chequing, savings, debt, investment, liability).

**Product B evolution:**
- Accept both `'chequing'` and `'checking'` in the schema
- Migrate to shadcn `Card`, `Input`, `Badge` components

---

### 10. 📝 Events Manager
**Status: ✅ KEEP**

**Files:** [`EventsManager.tsx`](file:///c:/Users/Rafael/workspace/repos/payday-planner/src/components/EventsManager.tsx)

**What it does:** Full CRUD for financial events (inflow/outflow/transfer). Sortable tables, type and status filters, slide-over drawer editor with auto-save on blur. Supports scheduling, weekend shifts, clearing delays, execution modes.

**Product B evolution:**
- Slide-over drawer migrates to shadcn `Sheet`
- Filter and sort controls migrate to shadcn `Button` variants

---

## New Features (Product B)

### 11. 📄 Bank-Agnostic Document Parsing
**View:** `/intelligence/analysis` (replaces current Analysis tab)
**Backend dependency:** FastAPI + Docling + LLM provider

**What it does:** Drop any PDF or CSV bank/credit card statement from any bank in any country. A two-stage pipeline extracts and interprets the transactions:

```
Document drops in
      │
      ├── Known CSV profile? → Fast deterministic parse (existing code, no cost)
      │
      └── Unknown CSV or PDF?
            │
            ▼
      ┌─────────────┐
      │   Docling    │  Stage 1: Extract tables/text from document
      └──────┬──────┘
             │
             ▼
      ┌─────────────┐
      │   LLM Call   │  Stage 2: Identify date/merchant/amount columns,
      │              │  normalize merchants, resolve currencies
      └──────┬──────┘
             │
             ▼
      Structured transactions → displayed in-app
```

- **Bank agnostic:** No profiles to maintain. Tangerine PDF and Chase US PDF both just work.
- **Format agnostic:** PDFs, CSVs, even photos of paper statements (Docling handles images).
- **Country agnostic:** LLM handles currency symbols, date formats, and language.
- **Self-healing:** If a bank changes their statement layout, the LLM adapts. No code change needed.

---

### 12. 🤖 LLM Provider Management
**View:** `/settings/providers`
**Backend dependency:** FastAPI

**What it does:** A settings view where users configure, enable/disable, and test AI providers:

- **Ollama (Local)** — first-class citizen. No API key, no data leaves the machine. Recommended default.
- **OpenAI** — cloud provider, requires API key.
- **Anthropic** — cloud provider, requires API key.
- **Google Gemini** — cloud provider, requires API key.
- **Clipboard (Manual)** — always on, permanent fallback. Product A workflow preserved.

Each provider shows: endpoint/key input, model selector, enable/disable toggle, connection test, status indicator (🟢/🔴/⚪).

Default provider selector determines which provider is used by Chat, Analysis, and Quick Check-In.

**Privacy:** API keys stored locally in `~/.payday/config.json`. The Python backend calls provider APIs directly from the user's machine. No intermediary server.

---

### 13. 💬 In-App AI Chat
**View:** `/intelligence/chat`
**Backend dependency:** FastAPI + configured LLM provider

**What it does:** A conversational chat panel where users ask freeform financial questions against their live data. The current blueprint is automatically injected as system context — the user never sees it, but the LLM always has full financial awareness.

- Example queries: *"Can I afford a \$5k vacation in March?"*, *"What happens if I increase my LOC payment to \$700/month?"*, *"Summarize my financial health."*
- Message list with user/assistant bubbles
- Routes to the user's default provider from Provider Settings
- Graceful fallback: if no provider is configured, shows a setup prompt linking to `/settings/providers`
- Chat history stored in `localStorage` (separate from blueprint data)

---

### 14. 📊 Dedicated Projections View
**View:** `/planner/projections`
**Backend dependency:** None (pure frontend)

**What it does:** The projection chart currently lives embedded in the Dashboard. This gives it a dedicated full-width view with richer controls:

- Full-width interactive Recharts timeline
- Custom date range picker (start/end dates, not just 30/60/90/180 presets)
- Per-account toggle panel (show/hide individual account lines on the chart)
- Alert episodes displayed alongside the chart
- Future: scenario comparison panel ("what if I increase rent by \$200?")

---

### 15. 🔍 Command Palette (⌘K)
**Component:** `app/command-palette.tsx`
**Backend dependency:** None (pure frontend)

**What it does:** A universal search and command interface, triggered by `⌘K` (or `Ctrl+K`). Built with shadcn's `Command` component (wrapping `cmdk`).

**Command groups:**
- **Navigation:** Jump to any page (Dashboard, Accounts, Events, Chat, etc.)
- **Actions:** "Add Account", "Add Event", "Export JSON", "Quick Check-in", "Copy for LLM"
- **Quick Access:** Search accounts and events by name — selecting one navigates to its manager with the item focused
- **Future (with provider):** Natural language queries route to the Chat panel

---

### 16. ⚙️ Global Settings & Preferences
**View:** `/settings/preferences`
**Backend dependency:** None (stored in `localStorage` via `useSettingsStore`)

**What it does:** Centralizes configuration that is currently scattered or hardcoded:

- **Locale:** en-CA, en-US, en-GB, fr-CA
- **Currency display:** CAD (\$), USD (\$), EUR (€), GBP (£)
- **Date format:** YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
- **Pay frequency default:** Biweekly, Semi-monthly, Monthly, Weekly
- **Theme:** Light / Dark / System
- **"Balances reflect today" default toggle**
- **Factory reset** (moved from Export tab) with template selection: Single, Couple, Family

---

### 17. 💾 Backup Management
**View:** `/data/backup`
**Backend dependency:** Optional (can work with localStorage snapshots or file system via backend)

**What it does:** Versioned local snapshots of the user's blueprint data:

- Manual snapshot creation with optional labels
- Snapshot list with timestamps and sizes
- Restore from any previous snapshot
- Auto-snapshot before destructive operations (factory reset, large imports)
- Future (with backend): file-system-based snapshots in `~/.payday/backups/`

---

## UI Architecture

### Navigation Hierarchy

The current flat 7-tab sidebar is replaced with a hierarchical navigation rail:

```
💸 Payday
│
├── Overview
│   ├── Dashboard              → /overview/dashboard       (default route)
│   └── Flow Diagram           → /overview/flow-diagram
│
├── Planner
│   ├── Accounts               → /planner/accounts
│   ├── Events                 → /planner/events
│   ├── Timeline               → /planner/timeline
│   └── Projections            → /planner/projections      ← NEW
│
├── Intelligence
│   ├── Spending Analysis      → /intelligence/analysis
│   ├── Chat                   → /intelligence/chat         ← NEW
│   └── Prompt Export          → /intelligence/prompt-export
│
├── Data
│   ├── Import / Export        → /data/import-export
│   └── Backup                 → /data/backup               ← NEW
│
└── ─── Context Switchers (bottom of rail) ───
    ├── 🤖 Provider Status     → opens /settings/providers   ← NEW
    ├── 👤 Household           → profile switcher dropdown
    └── ⚙  Settings            → /settings/preferences       ← NEW
```

### Layout Structure

```
┌──────────────────────┬──────────────────────────────────────────────┐
│  Navigation Rail     │  Header Bar                                 │
│  (collapsible)       │  ┌─────────────────────────────────────┐    │
│                      │  │ 🔍 Quick search...             ⌘K  │    │
│  ▾ Section           │  │ [Quick Check-in]                    │    │
│    Sub-item          │  │ Breadcrumb: Section > Page          │    │
│    Sub-item          │  └─────────────────────────────────────┘    │
│    Sub-item          │                                             │
│                      │  Main Content Area                          │
│  ▸ Section           │  (modular cards and panels)                 │
│                      │                                             │
│  ▸ Section           │                                             │
│                      │                                             │
│ ──────────────────── │                                             │
│ 🤖 Provider    🟢   │                                             │
│ 👤 Household   ▾    │                                             │
│ ⚙  Settings         │                                             │
└──────────────────────┴─────────────────────────────────────────────┘
```

### Responsive Behavior
- **Desktop:** Full sidebar with labels, expanded sections
- **Tablet:** Sidebar collapses to icon-only rail
- **Mobile:** Sidebar becomes a slide-out drawer via `SidebarTrigger`

---

## Feature Summary

```
EXISTING (10):
  ✅ KEEP (6):    Projection Engine, Guilt-Free Buffer, Timeline Checklist,
                   Quick Check-In, Accounts Manager, Events Manager
  ⚠️ EVOLVE (4):  Flow Diagram, CSV Parser → Docling pipeline,
                   LLM Prompt Generator → multi-mode AI, Export defaults

NEW (7):
  📄 Bank-Agnostic Document Parsing    (backend required)
  🤖 LLM Provider Management           (backend required)
  💬 In-App AI Chat                     (backend required)
  📊 Dedicated Projections View         (frontend only)
  🔍 Command Palette (⌘K)              (frontend only)
  ⚙️ Global Settings & Preferences      (frontend only)
  💾 Backup Management                  (frontend, backend optional)
```
