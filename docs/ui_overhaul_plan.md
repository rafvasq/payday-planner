# UI Overhaul — Implementation Plan

> [!IMPORTANT]
> **Guiding principle:** The core logic (`src/core/*`) and the Zustand store are untouched during this overhaul. We are only reshaping the presentation layer and adding new views. Product A keeps working at every phase.

---

## Stack Decision

### What Stays ✅
| Tool | Version | Why it stays |
| :--- | :--- | :--- |
| **React** | 19 | No reason to switch. The entire component library ecosystem is React-first. |
| **Vite** | 6 | Fast, already configured, path aliases working. |
| **TypeScript** | 5.7 | Strict mode already on. |
| **Zustand** | 5 | Lightweight, no boilerplate. Perfect for local-first state. |
| **Recharts** | 2.15 | Keeps powering projection charts. |
| **Mermaid** | 11 | Keeps powering flow diagrams. |
| **Zod** | 3 | Keeps powering schema validation. |
| **Lucide React** | 0.475 | Icon library. Consistent with shadcn/ui's default. |
| **date-fns** | 4 | Date logic throughout core. |

### What Gets Added ➕
| Tool | Purpose |
| :--- | :--- |
| **[shadcn/ui](https://ui.shadcn.com)** | Component primitives (Sidebar, Card, Button, Dialog, Sheet, Tooltip, Collapsible, Command). Not installed as a dependency — components are copied into `src/components/ui/` and owned by us. |
| **[Radix UI](https://www.radix-ui.com)** | Accessible headless primitives that shadcn/ui is built on. Installed as needed per component. |
| **[cmdk](https://cmdk.paco.me)** | Powers the `⌘K` command palette. Already a shadcn/ui component. |
| **[TanStack Router](https://tanstack.com/router)** | Type-safe file-based routing. Replaces the `activeTab` string switching in the Zustand store with real URL-based navigation (`/dashboard`, `/planner/accounts`, `/intelligence/chat`). |

### What Gets Upgraded ⬆️
| Tool | From | To | Why |
| :--- | :--- | :--- | :--- |
| **Tailwind CSS** | v3.4 | **v4** | CSS-first configuration, native `@theme` directive, better CSS variable integration. shadcn/ui v2+ is built for Tailwind v4. |

### What Gets Removed ➖
| Tool | Why |
| :--- | :--- |
| **clsx + tailwind-merge** | shadcn/ui bundles its own `cn()` utility using these. We consolidate to one import. |
| **postcss.config.js** | Tailwind v4 uses `@import "tailwindcss"` directly in CSS. PostCSS plugin config is no longer needed. |

---

## New Directory Structure

```
src/
├── app/                          # App shell & routing
│   ├── layout.tsx                # Root layout (sidebar + main area)
│   ├── routes/                   # TanStack Router route definitions
│   │   ├── overview/
│   │   │   ├── dashboard.tsx
│   │   │   └── flow-diagram.tsx
│   │   ├── planner/
│   │   │   ├── accounts.tsx
│   │   │   ├── events.tsx
│   │   │   ├── timeline.tsx
│   │   │   └── projections.tsx   # NEW — dedicated projection view
│   │   ├── intelligence/
│   │   │   ├── analysis.tsx
│   │   │   ├── chat.tsx          # NEW — in-app AI chat
│   │   │   └── prompt-export.tsx
│   │   ├── data/
│   │   │   ├── import-export.tsx
│   │   │   └── backup.tsx        # NEW — snapshot management
│   │   └── settings/
│   │       ├── providers.tsx     # NEW — LLM provider management
│   │       └── preferences.tsx   # NEW — locale, currency, theme
│   └── command-palette.tsx       # ⌘K command palette
│
├── components/
│   ├── ui/                       # shadcn/ui primitives (owned by us)
│   │   ├── sidebar.tsx
│   │   ├── card.tsx
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── sheet.tsx
│   │   ├── collapsible.tsx
│   │   ├── command.tsx           # cmdk wrapper
│   │   ├── tooltip.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   └── ...
│   │
│   ├── nav/                      # Navigation components
│   │   ├── app-sidebar.tsx       # The full navigation rail
│   │   ├── nav-section.tsx       # Collapsible section (Overview, Planner, etc.)
│   │   ├── nav-item.tsx          # Individual nav link
│   │   └── context-switchers.tsx # Provider status, household, settings
│   │
│   ├── dashboard/                # Dashboard-specific widgets
│   │   ├── net-worth-card.tsx
│   │   ├── guilt-free-card.tsx
│   │   ├── cashflow-summary.tsx
│   │   ├── upcoming-agenda.tsx
│   │   └── alert-banner.tsx
│   │
│   ├── projection/               # Projection-specific widgets
│   │   ├── projection-chart.tsx  # Migrated from current ProjectionChart
│   │   ├── metric-selector.tsx
│   │   └── scenario-panel.tsx    # NEW — what-if comparisons
│   │
│   ├── intelligence/             # AI-specific widgets
│   │   ├── chat-panel.tsx        # NEW
│   │   ├── chat-message.tsx      # NEW
│   │   └── spending-table.tsx    # Migrated from AnalysisTab
│   │
│   ├── planner/                  # Planner-specific widgets
│   │   ├── accounts-manager.tsx  # Migrated
│   │   ├── events-manager.tsx    # Migrated
│   │   ├── event-drawer.tsx      # Migrated (slide-over form)
│   │   └── timeline-checklist.tsx# Migrated
│   │
│   └── shared/                   # Cross-cutting components
│       ├── quick-checkin-modal.tsx
│       ├── flow-diagram.tsx      # Migrated
│       └── header-bar.tsx        # New top bar with search
│
├── core/                         # UNTOUCHED — business logic stays here
│   ├── bankProfiles.ts
│   ├── buffer.ts
│   ├── calendar.ts
│   ├── csvParser.ts
│   ├── models.ts
│   ├── projection.ts
│   ├── prompt.ts
│   ├── serialization.ts
│   └── __tests__/
│
├── store/
│   ├── usePlannerStore.ts        # UNTOUCHED
│   └── useSettingsStore.ts       # NEW — provider configs, locale, theme
│
├── lib/
│   └── utils.ts                  # shadcn cn() utility
│
├── index.css                     # Tailwind v4 entry point
└── main.tsx                      # App entry with router provider
```

---

## Navigation Hierarchy (Final)

```
💸 Payday
│
├── Overview
│   ├── Dashboard          → /overview/dashboard       (default route)
│   └── Flow Diagram       → /overview/flow-diagram
│
├── Planner
│   ├── Accounts           → /planner/accounts
│   ├── Events             → /planner/events
│   ├── Timeline           → /planner/timeline
│   └── Projections        → /planner/projections      ← NEW
│
├── Intelligence
│   ├── Spending Analysis  → /intelligence/analysis
│   ├── Chat               → /intelligence/chat         ← NEW
│   └── Prompt Export      → /intelligence/prompt-export
│
├── Data
│   ├── Import / Export    → /data/import-export
│   └── Backup             → /data/backup               ← NEW
│
└── ─── Context Switchers (bottom) ───
    ├── 🤖 Provider Status → opens /settings/providers   ← NEW
    ├── 👤 Household       → profile switcher dropdown
    └── ⚙  Settings        → /settings/preferences       ← NEW
```

---

## Phased Rollout

### Phase 0 — Foundation (Day 1-2)
> Set up the new tooling without breaking anything.

- [ ] Upgrade Tailwind v3 → v4
  - Replace `tailwind.config.js` with CSS-based `@theme` config in `index.css`
  - Remove `postcss.config.js` (Tailwind v4 runs as a Vite plugin)
  - Migrate custom `brand-*` and `ink-*` colors to CSS variables
- [ ] Initialize shadcn/ui
  - Run `npx shadcn@latest init`
  - Install base components: `button`, `card`, `sidebar`, `collapsible`, `command`, `dialog`, `sheet`, `tooltip`, `input`, `badge`, `separator`
  - Verify `cn()` utility in `src/lib/utils.ts`
- [ ] Install TanStack Router
  - Configure file-based route tree
  - Create route stubs for all paths (rendering placeholder content)
  - Wrap app in `RouterProvider`
- [ ] Create `useSettingsStore.ts`
  - Provider configs (type, endpoint, apiKey, model, enabled)
  - Locale, currency, theme preferences
  - Persist to `localStorage` under `'payday_settings'`
- [ ] **Checkpoint:** App still renders via old `App.tsx` at `/`. New router handles `/overview/dashboard` etc. with placeholder pages. Nothing is broken.

---

### Phase 1 — App Shell (Day 3-5)
> Build the new layout: navigation rail + header bar + main viewport.

- [ ] Build `app/layout.tsx` — the root layout
  - shadcn `SidebarProvider` + `Sidebar` + `SidebarInset` (main content area)
  - Collapsible sidebar with `SidebarTrigger` for mobile
- [ ] Build `components/nav/app-sidebar.tsx`
  - 4 `SidebarGroup` sections: Overview, Planner, Intelligence, Data
  - Each section uses `Collapsible` + `SidebarMenuSub` for hierarchy
  - Active route highlighting via TanStack Router's `useMatchRoute()`
- [ ] Build `components/nav/context-switchers.tsx`
  - `SidebarFooter` with provider status indicator, household selector, settings link
- [ ] Build `components/shared/header-bar.tsx`
  - Global search trigger (⌘K badge)
  - Quick Check-in button (migrated from old `Header.tsx`)
  - Breadcrumb showing current section > page
- [ ] Build `app/command-palette.tsx`
  - shadcn `CommandDialog` with `cmdk`
  - Groups: Navigation, Actions, Quick Access
  - Navigation commands: jump to any page
  - Action commands: "Add Account", "Add Event", "Export JSON", "Quick Check-in"
  - Quick Access: search accounts and events by name
- [ ] **Checkpoint:** New shell renders at all routes. Sidebar navigates between placeholder pages. ⌘K opens and navigates. Old `App.tsx` is still importable as a fallback.

---

### Phase 2 — View Migration (Day 6-10)
> Move existing components into the new layout, one by one. Replace raw Tailwind with shadcn primitives where it improves consistency.

Migration order (least coupled → most coupled):

- [ ] **2a: Export & Import** → `/data/import-export`
  - Wrap sections in shadcn `Card` components
  - Replace custom buttons with shadcn `Button`
  - Replace custom modal with shadcn `Dialog`
- [ ] **2b: Accounts Manager** → `/planner/accounts`
  - Metric cards → shadcn `Card`
  - Member rename inputs → shadcn `Input`
  - Account type badges → shadcn `Badge`
- [ ] **2c: Events Manager** → `/planner/events`
  - Slide-over drawer → shadcn `Sheet` (side panel)
  - Filter buttons → shadcn `Button` variant="outline"
  - Sort controls → shadcn `Button` with icons
- [ ] **2d: Timeline Checklist** → `/planner/timeline`
  - Date accordion → shadcn `Collapsible`
  - Checkboxes → shadcn `Checkbox` (from Radix)
- [ ] **2e: Analysis Tab** → `/intelligence/analysis`
  - Drop zone stays custom (shadcn has no drop zone)
  - Result tables → shadcn `Table` (if added) or keep current
  - Copy button → shadcn `Button` with toast feedback
- [ ] **2f: Flow Diagram** → `/overview/flow-diagram`
  - Orientation toggle → shadcn `Button` group
  - Wrap in `Card`
- [ ] **2g: Dashboard** → `/overview/dashboard`
  - Break into sub-components: `net-worth-card`, `guilt-free-card`, `cashflow-summary`, `upcoming-agenda`
  - Each widget is a shadcn `Card`
  - Embed `ProjectionChart` as `projection/projection-chart.tsx`
  - Alert banners → custom but consistent with shadcn styling
- [ ] **Checkpoint:** All 7 original views live in the new layout. Old `App.tsx` and `Header.tsx` are deleted. Full feature parity with Product A.

---

### Phase 3 — New Views (Day 11-15)
> Build the 4 new views that define Product B.

- [ ] **3a: Dedicated Projections** → `/planner/projections`
  - Full-width projection chart (not embedded in dashboard)
  - Date range picker (custom start/end, not just 30/60/90/180 presets)
  - Per-account toggle panel (show/hide individual account lines)
  - Scenario panel stub (future: "what if I increase rent by $200?")
- [ ] **3b: Provider Settings** → `/settings/providers`
  - Provider cards: Ollama, OpenAI, Anthropic, Google Gemini
  - Each card: endpoint/key input, model selector, enable/disable toggle, test connection button
  - Status indicators (🟢 connected, 🔴 error, ⚪ disabled)
  - Default provider selector
  - "Clipboard (Manual)" always shown as a permanent fallback
- [ ] **3c: Global Settings** → `/settings/preferences`
  - Locale selector (en-CA, en-US, en-GB, fr-CA)
  - Currency display
  - Date format preference
  - Theme toggle (light / dark / system)
  - Pay frequency default (biweekly, semi-monthly, monthly)
  - "Balances reflect today" default toggle
  - Factory reset (moved from Export tab)
- [ ] **3d: AI Chat Panel** → `/intelligence/chat`
  - Message list with user/assistant bubbles
  - Input bar with send button
  - Auto-injects current blueprint as system context (user never sees it)
  - Routes to default provider from `useSettingsStore`
  - Graceful fallback: if no provider configured, shows setup prompt linking to `/settings/providers`
  - Chat history stored in `localStorage` (separate from blueprint)
- [ ] **Checkpoint:** All new views functional. Product B features are accessible. Product A workflow (clipboard copy) still works unchanged via Prompt Export page.

---

### Phase 4 — Polish (Day 16-20)
> Refinement, accessibility, responsive design.

- [ ] **Keyboard navigation**
  - Tab through sidebar items
  - Arrow keys within sections
  - `Escape` closes command palette, sheets, dialogs
- [ ] **Responsive / mobile layout**
  - Sidebar collapses to icon-only rail on tablet
  - Sidebar becomes a slide-out drawer on mobile (`SidebarTrigger`)
  - Dashboard cards stack vertically
  - Command palette goes full-width on mobile
- [ ] **Dark mode**
  - CSS variables already support it via shadcn's `dark:` class strategy
  - Toggle in Settings + system preference detection
- [ ] **Transitions & animations**
  - Sidebar collapse/expand animation
  - Route transition fades
  - Card hover states
  - Toast notifications for clipboard copy, save confirmations
- [ ] **Checkpoint:** Production-ready UI. Ship it.

---

## Component Migration Map

| Old File | New Location | Changes |
| :--- | :--- | :--- |
| `App.tsx` | `app/layout.tsx` + `app/routes/*` | Completely replaced by router + shell |
| `Header.tsx` | `components/shared/header-bar.tsx` | Branding moves to sidebar. Search + Quick Check-in stay in header. |
| `Dashboard.tsx` | `app/routes/overview/dashboard.tsx` + `components/dashboard/*` | Decomposed into 4-5 widget components |
| `AccountsManager.tsx` | `app/routes/planner/accounts.tsx` + `components/planner/accounts-manager.tsx` | shadcn Card/Input/Badge replacements |
| `EventsManager.tsx` | `app/routes/planner/events.tsx` + `components/planner/events-manager.tsx` + `event-drawer.tsx` | Drawer → shadcn Sheet |
| `TimelineChecklist.tsx` | `app/routes/planner/timeline.tsx` + `components/planner/timeline-checklist.tsx` | Accordion → shadcn Collapsible |
| `AnalysisTab.tsx` | `app/routes/intelligence/analysis.tsx` + `components/intelligence/spending-table.tsx` | Minor shadcn wrapping |
| `FlowDiagram.tsx` | `app/routes/overview/flow-diagram.tsx` + `components/shared/flow-diagram.tsx` | Minor shadcn wrapping |
| `ProjectionChart.tsx` | `components/projection/projection-chart.tsx` | Used in both Dashboard and dedicated Projections view |
| `QuickCheckInModal.tsx` | `components/shared/quick-checkin-modal.tsx` | shadcn Dialog replacement |
| `ExportImport.tsx` | `app/routes/data/import-export.tsx` | shadcn Card/Button/Dialog replacements |

---

> [!NOTE]
> **Total estimated effort:** ~20 working days for a solo developer. Phases 0-2 (foundation + migration) can ship as a single PR to achieve feature parity with the new layout. Phases 3-4 (new features + polish) ship incrementally after.
