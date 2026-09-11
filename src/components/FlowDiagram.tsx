import React, { useState, useMemo, useEffect, useRef } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import mermaid from 'mermaid';
import { Network, Copy, Check, Download, ArrowRight, ArrowDown } from 'lucide-react';

export const FlowDiagram: React.FC = () => {
  const { events, accounts, members } = usePlannerStore();
  const [copied, setCopied] = useState(false);
  const [layoutDir, setLayoutDir] = useState<'LR' | 'TD'>('LR');
  const containerRef = useRef<HTMLDivElement>(null);

  const memberNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, [members]);

  const mermaidSource = useMemo(() => {
    const activeEvents = events.filter((e) => e.active);
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_');

    const lines: string[] = [`graph ${layoutDir}`];

    // Separate accounts by ownership
    const rName = memberNameMap['A'] || 'Member A';
    const jName = memberNameMap['B'] || 'Member B';

    const rAccts = accounts.filter((a) => a.owner === 'A');
    const jAccts = accounts.filter((a) => a.owner === 'B');
    const jointAccts = accounts.filter(
      (a) => a.owner === 'Joint' || a.owner === 'Joint/Both'
    );

    // 1. Inflows Subgraph
    const inflows = activeEvents.filter(
      (e) => e.event_type === 'inflow' && !e.from_account_id
    );
    if (inflows.length > 0) {
      lines.push('  subgraph Inflows ["Incomes & Inflows"]');
      for (const e of inflows) {
        const nodeId = 'in_' + safe(e.id);
        lines.push(
          `    ${nodeId}["${e.name}<br/><b>$${e.amount.toLocaleString()} ${e.frequency}</b>"]:::inflow`
        );
      }
      lines.push('  end');
    }

    // 2. Member A Accounts Subgraph
    if (rAccts.length > 0) {
      lines.push(`  subgraph R_Accounts ["${rName}'s Accounts"]`);
      for (const a of rAccts) {
        const cls =
          a.type === 'chequing'
            ? 'chequing'
            : a.type === 'savings'
            ? 'savings'
            : 'liability';
        lines.push(
          `    ${safe(a.id)}["${a.name}<br/><i>${a.type}</i>"]:::${cls}`
        );
      }
      lines.push('  end');
    }

    // 3. Member B Accounts Subgraph
    if (jAccts.length > 0) {
      lines.push(`  subgraph J_Accounts ["${jName}'s Accounts"]`);
      for (const a of jAccts) {
        const cls =
          a.type === 'chequing'
            ? 'chequing'
            : a.type === 'savings'
            ? 'savings'
            : 'liability';
        lines.push(
          `    ${safe(a.id)}["${a.name}<br/><i>${a.type}</i>"]:::${cls}`
        );
      }
      lines.push('  end');
    }

    // 4. Joint Accounts Subgraph
    if (jointAccts.length > 0) {
      lines.push('  subgraph Joint_Accounts ["Joint Hub & Savings"]');
      for (const a of jointAccts) {
        const cls =
          a.type === 'chequing'
            ? 'chequing'
            : a.type === 'savings'
            ? 'savings'
            : a.type === 'debt'
            ? 'debt'
            : 'liability';
        lines.push(
          `    ${safe(a.id)}["${a.name}<br/><i>${a.type}</i>"]:::${cls}`
        );
      }
      lines.push('  end');
    }

    // 5. Outflows Subgraph
    const outflows = activeEvents.filter(
      (e) => e.event_type === 'outflow' && !e.to_account_id
    );
    if (outflows.length > 0) {
      lines.push('  subgraph Outflows ["Bills, Taxes & Mortgages"]');
      for (const e of outflows) {
        const nodeId = 'out_' + safe(e.id);
        lines.push(
          `    ${nodeId}["${e.name}<br/><b>$${e.amount.toLocaleString()} ${e.frequency}</b>"]:::outflow`
        );
      }
      lines.push('  end');
    }

    // Connectors
    lines.push('');
    for (const e of activeEvents) {
      const freqShort =
        e.frequency === 'biweekly'
          ? 'bw'
          : e.frequency === 'monthly'
          ? 'mo'
          : e.frequency;
      const label = `"$${e.amount.toLocaleString()} (${freqShort})"`;

      if (e.event_type === 'inflow' && !e.from_account_id && e.to_account_id) {
        const src = 'in_' + safe(e.id);
        const dst = safe(e.to_account_id);
        lines.push(`  ${src} -->|${label}| ${dst}`);
      } else if (
        e.event_type === 'outflow' &&
        !e.to_account_id &&
        e.from_account_id
      ) {
        const src = safe(e.from_account_id);
        const dst = 'out_' + safe(e.id);
        lines.push(`  ${src} -->|${label}| ${dst}`);
      } else if (e.from_account_id && e.to_account_id) {
        const src = safe(e.from_account_id);
        const dst = safe(e.to_account_id);
        lines.push(`  ${src} ==>|${label}| ${dst}`);
      }
    }

    // Styling Rules
    lines.push('');
    lines.push(
      '  classDef inflow fill:#e6f4ea,stroke:#34a853,stroke-width:2px,color:#137333;'
    );
    lines.push(
      '  classDef chequing fill:#e8f0fe,stroke:#4285f4,stroke-width:2px,color:#174ea6;'
    );
    lines.push(
      '  classDef savings fill:#e6f4ea,stroke:#137333,stroke-width:2px,color:#0d652d;'
    );
    lines.push(
      '  classDef debt fill:#feefc3,stroke:#fbbc04,stroke-width:2px,color:#b06000;'
    );
    lines.push(
      '  classDef liability fill:#f3e8fd,stroke:#a142f4,stroke-width:2px,color:#681da8;'
    );
    lines.push(
      '  classDef outflow fill:#fce8e6,stroke:#ea4335,stroke-width:2px,color:#c5221f;'
    );

    return lines.join('\n');
  }, [events, accounts, memberNameMap, layoutDir]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
    });

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const id = 'mermaid-svg-' + Math.random().toString(36).substring(2, 8);
      mermaid
        .render(id, mermaidSource)
        .then(({ svg }) => {
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        })
        .catch((err) => console.error('Mermaid render error:', err));
    }
  }, [mermaidSource]);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(mermaidSource);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([mermaidSource], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payday_diagram.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-brand-500" />
          <div>
            <h2 className="text-base font-bold text-ink-900">Money Flow Diagram</h2>
            <p className="text-xs text-ink-400">
              Categorized, color-coded money flow architecture
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-ink-100 p-1 rounded-lg border border-ink-200 text-xs font-semibold">
            <button
              onClick={() => setLayoutDir('LR')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                layoutDir === 'LR'
                  ? 'bg-white text-brand-600 shadow-2xs font-bold'
                  : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              <ArrowRight className="w-3.5 h-3.5" /> Horizontal
            </button>
            <button
              onClick={() => setLayoutDir('TD')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                layoutDir === 'TD'
                  ? 'bg-white text-brand-600 shadow-2xs font-bold'
                  : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              <ArrowDown className="w-3.5 h-3.5" /> Vertical
            </button>
          </div>

          <button
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink-700 bg-ink-100 hover:bg-ink-200 rounded-lg transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copied' : 'Copy Mermaid Code'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download diagram.md</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
            Interactive Flow Diagram
          </h3>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-ink-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Inflows
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Chequing
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-700 inline-block" /> Savings
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Liabilities
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Outflows
            </span>
          </div>
        </div>

        <div className="overflow-x-auto p-6 bg-ink-100/30 rounded-lg border border-ink-200 flex justify-center min-h-[320px]">
          <div ref={containerRef} className="mermaid-container w-full flex justify-center" />
        </div>
      </div>

      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
          Mermaid Definition Source
        </h3>
        <pre className="p-4 bg-ink-900 text-ink-100 rounded-lg text-xs font-mono overflow-x-auto">
          {mermaidSource}
        </pre>
      </div>
    </div>
  );
};
