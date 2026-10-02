import React, { useState, useMemo, useEffect, useRef } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import mermaid from 'mermaid';
import { Network, Copy, Check, Download, ArrowRight, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

    // 2. Dynamic Member Subgraphs (Iterate through all members instead of hardcoding 0 and 1)
    members.forEach(member => {
      const memberAccts = accounts.filter((a) => a.owner === member.id);
      if (memberAccts.length > 0) {
        lines.push(`  subgraph ${safe(member.id)}_Accounts ["${member.name}'s Accounts"]`);
        for (const a of memberAccts) {
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
    });

    // 3. Joint Accounts Subgraph
    const jointAccts = accounts.filter(
      (a) => a.owner === 'Joint' || a.owner === 'Joint/Both'
    );
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

    // 4. Other/Unknown Owners
    const knownOwners = new Set([...members.map(m => m.id), 'Joint', 'Joint/Both']);
    const otherAccts = accounts.filter((a) => !knownOwners.has(a.owner));
    if (otherAccts.length > 0) {
      lines.push('  subgraph Other_Accounts ["Other Accounts"]');
      for (const a of otherAccts) {
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
    // Adapt to shadcn CSS variable themes using fixed distinct colors for visibility
    lines.push('  classDef inflow fill:#e6f4ea,stroke:#34a853,stroke-width:2px,color:#137333;');
    lines.push('  classDef chequing fill:#e8f0fe,stroke:#4285f4,stroke-width:2px,color:#174ea6;');
    lines.push('  classDef savings fill:#e6f4ea,stroke:#137333,stroke-width:2px,color:#0d652d;');
    lines.push('  classDef debt fill:#feefc3,stroke:#fbbc04,stroke-width:2px,color:#b06000;');
    lines.push('  classDef liability fill:#f3e8fd,stroke:#a142f4,stroke-width:2px,color:#681da8;');
    lines.push('  classDef outflow fill:#fce8e6,stroke:#ea4335,stroke-width:2px,color:#c5221f;');

    return lines.join('\n');
  }, [events, accounts, members, layoutDir]);

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
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" />
            <div className="space-y-1">
              <CardTitle className="text-base">Money Flow Diagram</CardTitle>
              <CardDescription>
                Categorized, color-coded money flow architecture
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-muted p-1 rounded-md border border-border text-xs font-semibold">
              <button
                onClick={() => setLayoutDir('LR')}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-sm transition-all",
                  layoutDir === 'LR' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ArrowRight className="w-3.5 h-3.5" /> Horizontal
              </button>
              <button
                onClick={() => setLayoutDir('TD')}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-sm transition-all",
                  layoutDir === 'TD' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ArrowDown className="w-3.5 h-3.5" /> Vertical
              </button>
            </div>

            <Button variant="outline" size="sm" onClick={handleCopyCode}>
              {copied ? (
                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy Mermaid Code'}
            </Button>

            <Button size="sm" onClick={handleDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download diagram.md
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Interactive Flow Diagram
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#137333] inline-block" /> Inflows
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#174ea6] inline-block" /> Chequing
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0d652d] inline-block" /> Savings
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#b06000] inline-block" /> Debt
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#681da8] inline-block" /> Liabilities
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c5221f] inline-block" /> Outflows
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto p-4 sm:p-6 bg-muted/50 rounded-lg border border-border flex justify-center min-h-[320px]">
            <div ref={containerRef} className="mermaid-container w-full flex justify-center [&_svg]:max-w-full" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
            Mermaid Definition Source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="p-4 bg-zinc-950 text-zinc-50 rounded-lg text-xs font-mono overflow-x-auto">
            {mermaidSource}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};
