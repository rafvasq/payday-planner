/**
 * Figure provenance classifier & grounding verifier (Milestone 2).
 *
 * Traces currency figures in assistant messages back to their origin:
 * - Engine: exact match with engine tool output or plan state.
 * - Derived: arithmetic combination (pair or triple) of known engine figures.
 * - User-stated: appeared in previous user messages.
 * - Unverified: untraceable figure flagged with warning.
 */

import { Account, Event } from '../models';
import { FigureSource } from './toolkit';
import { toCents } from './world';

export type FigureClass = 'engine' | 'derived' | 'user_stated' | 'unverified';

export interface FigureClassification {
  rawText: string;
  cents: number;
  classification: FigureClass;
  sourceLabel?: string;
  formula?: string;
}

/**
 * Regex matching currency tokens with or without dollar signs and negative signs.
 * Supports standard Canadian/US formatting like -$1,211.92, $3,300.00, -$113.73.
 */
export const FIGURE_REGEX = /-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\$\d+(?:\.\d{2})?/g;

/**
 * Checks whether a raw token represents an actual currency figure.
 * Rejects plain counts, dates, and years (e.g., "30", "2026", "21").
 */
export function isCurrencyToken(token: string): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  // Must contain a dollar sign OR have a 2-decimal currency format (e.g., 113.73, -113.73)
  if (trimmed.includes('$')) return true;
  if (/\.\d{2}$/.test(trimmed)) return true;
  return false;
}

/**
 * Extracts all currency tokens from a text string.
 */
export function extractFigureTokens(content: string): string[] {
  if (!content) return [];
  const matches = content.match(FIGURE_REGEX) || [];
  return matches.filter((token) => isCurrencyToken(token));
}

/**
 * Parses a currency figure token into integer cents.
 * Handles negative signs (-$100, $-100, -$100.00, ($100)), dollar signs, commas, and decimals.
 * Returns null if the token cannot be parsed into a valid number or if it is a date/malformed string.
 */
export function parseFigureCents(text: string): number | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed === '$' || trimmed === '-' || trimmed === '--') return null;

  // Reject multiple minus signs (e.g., --$100.00, 2026-10-15)
  const minusCount = (trimmed.match(/-/g) || []).length;
  if (minusCount > 1) return null;

  // Reject dates or hyphens between digits (e.g. 2026-10-15)
  if (/\d-\d/.test(trimmed)) return null;

  const isNegative =
    trimmed.startsWith('-') ||
    trimmed.includes('$-') ||
    trimmed.startsWith('-$') ||
    (trimmed.startsWith('(') && trimmed.endsWith(')'));

  // Strip currency symbols, commas, parens, signs, spaces and trailing punctuation
  const cleaned = trimmed.replace(/[$,()+-\s]/g, '').replace(/[.,;:]+$/, '');
  if (!cleaned || !/^\d+(?:\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const floatVal = parseFloat(cleaned);
  if (isNaN(floatVal)) return null;
  const cents = Math.round(floatVal * 100);
  return isNegative && cents !== 0 ? -cents : cents;
}

/**
 * Formats integer cents into standard CAD currency format (e.g., "$2,486.54", "-$1,211.92").
 */
export function formatFigureCents(cents: number): string {
  const isNeg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const dollarsStr = dollars.toLocaleString('en-US');
  const centsStr = remainder.toString().padStart(2, '0');
  return `${isNeg ? '-' : ''}$${dollarsStr}.${centsStr}`;
}

/**
 * Finds an arithmetic derivation formula for targetCents from known engine sources.
 * Checks pairs:
 *   a + b == target
 *   a - b == target
 *   b - a == target
 * Checks triples:
 *   ± a ± b ± c == target
 * Operands must come from distinct sources in knownSources.
 * Returns formatted formula (e.g. "$2,486.54 + $3,200.00 = $5,686.54") or null.
 */
export function findDerivedFormula(
  targetCents: number,
  knownSources: FigureSource[]
): string | null {
  if (!knownSources || knownSources.length < 2) return null;

  // Extract non-zero positive amounts from distinct sources
  // Map to their absolute cent values, preserving distinct source instances
  const pool: number[] = [];
  for (const s of knownSources) {
    const val = Math.abs(s.cents);
    if (val !== 0) {
      pool.push(val);
    }
  }

  if (pool.length < 2) return null;

  const fmt = (c: number) => formatFigureCents(c);
  const targetStr = fmt(targetCents);

  // 1. Check pairs (a + b, a - b, b - a) using distinct source indices (j > i)
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j];

      // a + b
      if (a + b === targetCents) {
        return `${fmt(a)} + ${fmt(b)} = ${targetStr}`;
      }
      // a - b
      if (a - b === targetCents) {
        return `${fmt(a)} - ${fmt(b)} = ${targetStr}`;
      }
      // b - a
      if (b - a === targetCents) {
        return `${fmt(b)} - ${fmt(a)} = ${targetStr}`;
      }
      // -a + b
      if (-a + b === targetCents) {
        return `${fmt(b)} - ${fmt(a)} = ${targetStr}`;
      }
      // -a - b
      if (-a - b === targetCents) {
        return `-${fmt(a)} - ${fmt(b)} = ${targetStr}`;
      }
    }
  }

  // 2. Check triples (± a ± b ± c) using distinct source indices (k > j > i)
  // Bound search for performance: pool capped at 40 items
  const triplePool = pool.slice(0, 40);
  for (let i = 0; i < triplePool.length; i++) {
    const a = triplePool[i];
    for (let j = i + 1; j < triplePool.length; j++) {
      const b = triplePool[j];
      for (let k = j + 1; k < triplePool.length; k++) {
        const c = triplePool[k];

        // a + b + c
        if (a + b + c === targetCents) {
          return `${fmt(a)} + ${fmt(b)} + ${fmt(c)} = ${targetStr}`;
        }
        // a + b - c
        if (a + b - c === targetCents) {
          return `${fmt(a)} + ${fmt(b)} - ${fmt(c)} = ${targetStr}`;
        }
        // a - b + c
        if (a - b + c === targetCents) {
          return `${fmt(a)} + ${fmt(c)} - ${fmt(b)} = ${targetStr}`;
        }
        // a - b - c
        if (a - b - c === targetCents) {
          return `${fmt(a)} - ${fmt(b)} - ${fmt(c)} = ${targetStr}`;
        }
        // -a + b + c
        if (-a + b + c === targetCents) {
          return `${fmt(b)} + ${fmt(c)} - ${fmt(a)} = ${targetStr}`;
        }
        // -a + b - c
        if (-a + b - c === targetCents) {
          return `${fmt(b)} - ${fmt(a)} - ${fmt(c)} = ${targetStr}`;
        }
        // -a - b + c
        if (-a - b + c === targetCents) {
          return `${fmt(c)} - ${fmt(a)} - ${fmt(b)} = ${targetStr}`;
        }
        // -a - b - c
        if (-a - b - c === targetCents) {
          return `-${fmt(a)} - ${fmt(b)} - ${fmt(c)} = ${targetStr}`;
        }
      }
    }
  }

  return null;
}

/**
 * Harvests baseline engine figure sources from stored accounts and events.
 * Ensures baseline account balances, target floors, headrooms, and event amounts
 * are always recognized as verified engine figures.
 */
export function harvestBaselineSources(accounts: Account[], events: Event[]): FigureSource[] {
  const sources: FigureSource[] = [];

  for (const a of accounts) {
    const balCents = toCents(a.balance);
    sources.push({ cents: balCents, label: `${a.name} · balance` });

    if (a.target_floor !== undefined && a.target_floor !== null) {
      const floorCents = toCents(a.target_floor);
      sources.push({ cents: floorCents, label: `${a.name} · target floor` });
      sources.push({
        cents: balCents - floorCents,
        label: `${a.name} · headroom above floor`,
      });
    }
  }

  for (const e of events) {
    sources.push({ cents: toCents(e.amount), label: `${e.name} · amount` });
  }

  return sources;
}

/**
 * Classifies an individual currency figure token into:
 * - 'engine'
 * - 'derived'
 * - 'user_stated'
 * - 'unverified'
 */
export function classifyFigure(
  rawText: string,
  figureSources: FigureSource[],
  userMessages: string[]
): FigureClassification {
  const cents = parseFigureCents(rawText);
  if (cents === null) {
    return {
      rawText,
      cents: 0,
      classification: 'unverified',
      sourceLabel: 'Not produced by engine — treat with caution',
    };
  }

  // 1. Exact match with engine output
  const exactMatch = figureSources.find((s) => s.cents === cents);
  if (exactMatch) {
    return {
      rawText,
      cents,
      classification: 'engine',
      sourceLabel: exactMatch.label,
    };
  }

  // Also check opposite sign if label indicates an outflow or delta
  const oppositeMatch = figureSources.find((s) => s.cents === -cents);
  if (oppositeMatch && oppositeMatch.cents !== 0) {
    return {
      rawText,
      cents,
      classification: 'engine',
      sourceLabel: oppositeMatch.label,
    };
  }

  // 2. Derived arithmetic combination
  const formula = findDerivedFormula(cents, figureSources);
  if (formula) {
    return {
      rawText,
      cents,
      classification: 'derived',
      formula,
    };
  }

  // 3. User-stated figure in conversation history
  for (const uMsg of userMessages) {
    const userTokens = extractFigureTokens(uMsg);
    for (const uTok of userTokens) {
      const uCents = parseFigureCents(uTok);
      if (uCents !== null && (uCents === cents || uCents === -cents)) {
        return {
          rawText,
          cents,
          classification: 'user_stated',
          sourceLabel: 'Stated in conversation',
        };
      }
    }
  }

  // 4. Unverified figure
  return {
    rawText,
    cents,
    classification: 'unverified',
    sourceLabel: 'Not produced by engine — treat with caution',
  };
}

/**
 * Classifies all currency figures in an assistant message.
 */
export function classifyMessageFigures(
  content: string,
  figureSources: FigureSource[],
  userMessages: string[]
): {
  figures: FigureClassification[];
  totalFigures: number;
  unverifiedCount: number;
} {
  const tokens = extractFigureTokens(content);
  const figures = tokens.map((tok) => classifyFigure(tok, figureSources, userMessages));
  const unverifiedCount = figures.filter((f) => f.classification === 'unverified').length;

  return {
    figures,
    totalFigures: figures.length,
    unverifiedCount,
  };
}
