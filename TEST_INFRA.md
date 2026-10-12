# Payday Planner — Test Infrastructure & Quality Architecture

## 1. Test Philosophy

The Payday Planner test infrastructure is engineered for resilience, determinism, and high architectural fidelity across React 19, Vite, Zustand, and Vitest.

### Core Principles
1. **Behavioral Testing Over Implementation Details**:
   Tests verify external contracts, accessible user interactions (`screen.getByRole`, `screen.getByText`), and observable state transitions rather than private implementation details.
2. **Strict Test Isolation & Zero Flakiness**:
   Every test suite runs with completely isolated state. `localStorage` is wiped in global `beforeEach`, DOM instances are cleaned up by React Testing Library, and mock call queues are reset between runs.
3. **Deterministic Asynchronous Coordination**:
   Stream generators and LLM tool responses are mocked using deterministic async generator primitives without arbitrary sleep delays. Microtasks and batched React 19 updates are flushed cleanly using `waitFor` and standard RTL utilities.
4. **Authoritative Expected Output Derivation**:
   Expected behaviors are derived strictly from documented interface specifications (`PROJECT.md`, `ORIGINAL_REQUEST.md`, and `ai-chat-redesign-plan.md`). Facade tests and tautological assertions are prohibited.
5. **Progressive Testability**:
   Test suites are structured around milestone deliverables, allowing verification of foundational state and provider contracts before layering visual component suites.

---

## 2. Feature Inventory & Coverage Mapping

| ID | Feature | Specification Reference | Target Test Files | Milestone |
|---|---|---|---|---|
| **F1** | Mini Recharts Projection Chart | `ORIGINAL_REQUEST §R1.1`, Plan §7 | `src/components/__tests__/miniBalanceChart.test.tsx` | M3 |
| **F2** | Collapsible Raw JSON in Sim Cards | `ORIGINAL_REQUEST §R1.2`, Plan §7 | `src/components/__tests__/simulationCard.test.tsx` | M3 |
| **F3** | Model Popover with cmdk & Favorites | `ORIGINAL_REQUEST §R1.3`, Plan §4 | `src/store/__tests__/settingsFavorites.test.ts`<br>`src/components/__tests__/modelPopover.test.tsx` | M1 / M2 |
| **F4** | Undo Mechanism for Apply to Plan | `ORIGINAL_REQUEST §R1.4`, Plan §10 | `src/store/__tests__/plannerUndo.test.ts`<br>`src/components/__tests__/applyUndo.test.tsx` | M1 / M3 |
| **F5** | Message Regeneration (↻) | `ORIGINAL_REQUEST §R1.5`, Plan §13 | `src/components/__tests__/chatEditRegen.test.tsx` | M2 |
| **F6** | Context Glance Bar | `ORIGINAL_REQUEST §R1.6`, Plan §8 | `src/components/__tests__/contextGlanceBar.test.tsx` | M4 |
| **F7** | Floating Chat & Global `ChatProvider` | `ORIGINAL_REQUEST §R1.7`, Plan §9 | `src/components/__tests__/chatProvider.test.tsx` | M1 |
| **F8** | Tool Calling Engine & Loop Guard | Plan §14, `tools.ts`, `ChatPanel.tsx` | `src/components/__tests__/chatLoop.test.tsx` | M1 |

---

## 3. Four-Tier Coverage Methodology

The test suite applies a 4-tier testing hierarchy to achieve defense-in-depth across the entire application stack:

### Tier 1: Feature (Unit & Store State Transitions)
Focuses on pure functions, domain algorithms, and isolated Zustand store logic:
- **`usePlannerStore` Snapshot Engine**:
  - `applyBlueprintChangesWithSnapshot` atomically captures deep clones of `accounts`, `events`, and `executedEvents` alongside an epoch timestamp and optional description.
  - `restoreBlueprintSnapshot` cleanly restores all accounts, events, and executed overrides back into the store and writes through to `localStorage`.
- **`useSettingsStore` Favorites & Glance Persistence**:
  - `toggleFavoriteChatModel` toggles model IDs in `chatFavoriteModels` and persists array state to `payday_settings`.
  - `setShowContextGlance` toggles glance visibility flag.
- **Engine & Tool Validation**:
  - `projectBalances`, `generateSimulationDiff`, and Zod tool schemas (`simulate`, `propose_blueprint_changes`, `pause_event`).

### Tier 2: Boundary & Defensive Edge Conditions
Stress-tests boundary conditions, resource limits, and error recovery:
- **Loop Depth & Infinite Recursion Protection**:
  - Chat turn recursion guard halts after depth 5 (`depth >= 5`), emitting `[Error: Max tool calls exceeded]` without dispatching further API requests.
- **Stream Interruption & Abort Handling**:
  - Cancellation via `AbortController` or Escape key stops the async generator loop cleanly, setting `isStreaming` to false and marking partial messages as `(stopped)`.
- **Empty & Degenerate State Handling**:
  - Model favorites with empty lists, models already toggled, empty prompts, non-existent event IDs, accounts with 0 balance or negative balances.

### Tier 3: Cross-Feature Integration
Tests interactions across multiple modules and architectural boundaries:
- **`ChatProvider` Route Decoupling & Persistence**:
  - Chat session state (`messages`, `input`, `isStreaming`) survives navigation across React Router routes.
  - Floating trigger button (`ChatFAB`) renders on standard routes (`/overview/dashboard`, `/planner/timeline`) and automatically hides on `/intelligence/chat`.
- **Tool Results ↔ Store Synchronization**:
  - "Apply to Plan" action translates proposed blueprint changes into active store updates, immediately triggering recalculation across ledger and projection listeners.
- **Undo Integration**:
  - Executing undo reverts modified accounts and event dates while triggering UI state updates across views.

### Tier 4: Real-World Workload Scenarios
Validates end-to-end user journeys mirroring practical financial planning workflows:
- **Multi-Turn Advisory Journey**:
  1. User starts with dynamic starter prompt ("What are my upcoming moves this week?").
  2. Assistant triggers `simulate` tool call with 30-day projection diff.
  3. Assistant issues `propose_blueprint_changes` with actions (e.g., skip event, set amount).
  4. User reviews rich card and applies changes.
  5. User invokes "Undo" within 10-second grace window, completely restoring initial baseline.
- **Background Streaming During Navigation**:
  1. User initiates analysis prompt in floating chat sheet.
  2. User closes floating sheet and navigates to Dashboard.
  3. Floating action button displays active stream pulse badge (`animate-ping`).
  4. Reopening sheet shows completed generation without state loss.

---

## 4. Test Infrastructure Setup & JSDOM Polyfills

Vitest runs in a JSDOM environment configured via `vite.config.ts`:

```ts
// vite.config.ts
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setupTests.ts'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    reportOnFailure: true,
  },
}
```

### Centralized Polyfill Library (`src/test/setupTests.ts`)
- **`ResizeObserver`**: Polyfilled with a mock class (`observe`, `unobserve`, `disconnect`) to allow Recharts and Radix primitives to mount without geometry exceptions.
- **`IntersectionObserver`**: Polyfilled with a mock class triggering immediate intersection callbacks, enabling smart auto-scroll testing.
- **`scrollIntoView`**: Polyfilled on `HTMLElement.prototype` as a stub function.
- **Global Isolation**: Global `beforeEach(() => { localStorage.clear(); })` guarantees complete storage isolation across all tests.

---

## 5. Verification Commands & Pass Criteria

### Execution Commands
- **Run Entire Test Suite**:
  ```powershell
  npm test
  ```
- **Run Specific Test File**:
  ```powershell
  npx vitest run src/store/__tests__/plannerUndo.test.ts
  ```
- **Run Component Tests Only**:
  ```powershell
  npx vitest run src/components/__tests__/
  ```
- **Typecheck & Production Build**:
  ```powershell
  npm run build
  ```

### Acceptance Pass Criteria
1. **Zero Test Failures**: 100% of tests must pass (`0 failed`).
2. **Zero Build & Type Errors**: `npm run build` must complete cleanly with exit code 0.
3. **No Flakiness or Leakage**: Tests must pass repeatedly in arbitrary order.
4. **Coverage Completeness**: Every core feature across M1–M4 has dedicated Tier 1–Tier 3 test coverage.
