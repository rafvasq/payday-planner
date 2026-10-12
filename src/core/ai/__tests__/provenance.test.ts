import { describe, it, expect } from 'vitest';
import {
  parseFigureCents,
  extractFigureTokens,
  findDerivedFormula,
  classifyMessageFigures,
} from '../provenance';
import { FigureSource } from '../toolkit';

describe('Provenance Verifier: parseFigureCents', () => {
  it('parses standard positive currency amounts into integer cents', () => {
    expect(parseFigureCents('$100.00')).toBe(10000);
    expect(parseFigureCents('$3,300.00')).toBe(330000);
    expect(parseFigureCents('$3,300')).toBe(330000);
    expect(parseFigureCents('$2,486.54')).toBe(248654);
    expect(parseFigureCents('$5,686.54')).toBe(568654);
    expect(parseFigureCents('$1,234,567.89')).toBe(123456789);
  });

  it('parses zero currency values properly', () => {
    expect(parseFigureCents('$0.00')).toBe(0);
    expect(parseFigureCents('$0')).toBe(0);
    expect(parseFigureCents('-$0.00')).toBe(0);
    expect(parseFigureCents('0.00')).toBe(0);
  });

  it('parses negative currency amounts with various prefix formats', () => {
    expect(parseFigureCents('-$1,211.92')).toBe(-121192);
    expect(parseFigureCents('-$113.73')).toBe(-11373);
    expect(parseFigureCents('-$1,430.92')).toBe(-143092);
    expect(parseFigureCents('- $50.00')).toBe(-5000);
    expect(parseFigureCents('-$50')).toBe(-5000);
    expect(parseFigureCents('-113.73')).toBe(-11373);
  });

  it('parses amounts formatted without dollar sign if decimal currency format', () => {
    expect(parseFigureCents('1,211.92')).toBe(121192);
    expect(parseFigureCents('2486.54')).toBe(248654);
    expect(parseFigureCents('-1211.92')).toBe(-121192);
  });

  it('handles small cent values accurately avoiding float inaccuracies', () => {
    expect(parseFigureCents('$0.01')).toBe(1);
    expect(parseFigureCents('$0.05')).toBe(5);
    expect(parseFigureCents('$0.99')).toBe(99);
    expect(parseFigureCents('-$0.01')).toBe(-1);
  });

  it('returns null for non-currency or malformed strings', () => {
    expect(parseFigureCents('')).toBeNull();
    expect(parseFigureCents('abc')).toBeNull();
    expect(parseFigureCents('hello world')).toBeNull();
    expect(parseFigureCents('2026-10-15')).toBeNull();
    expect(parseFigureCents('$')).toBeNull();
    expect(parseFigureCents('-')).toBeNull();
    expect(parseFigureCents('--$100.00')).toBeNull();
  });
});

describe('Provenance Verifier: extractFigureTokens', () => {
  it('extracts positive, negative, and comma-separated currency tokens from prose', () => {
    const text = 'You transferred $3,200.00 to EQ Hub, leaving -$1,211.92 in Chequing and $3,300.00 in reserve.';
    const tokens = extractFigureTokens(text);
    expect(tokens).toContain('$3,200.00');
    expect(tokens).toContain('-$1,211.92');
    expect(tokens).toContain('$3,300.00');
    expect(tokens.length).toBe(3);
  });

  it('ignores dates and non-currency integers in text', () => {
    const text = 'On 2026-10-15, your 3 scheduled bills total $145.50 leaving $2,486.54.';
    const tokens = extractFigureTokens(text);
    expect(tokens).toContain('$145.50');
    expect(tokens).toContain('$2,486.54');
    expect(tokens).not.toContain('2026-10-15');
    expect(tokens).not.toContain('2026');
    expect(tokens).not.toContain('3');
    expect(tokens.length).toBe(2);
  });

  it('handles parenthetical currency figures and edge punctuation', () => {
    const text = 'Deficit (-$113.73), baseline ($4,357.22), and recovery ($0.00).';
    const tokens = extractFigureTokens(text);
    expect(tokens.length).toBe(3);
    const parsed = tokens.map((t) => parseFigureCents(t));
    expect(parsed).toEqual([-11373, 435722, 0]);
  });

  it('returns empty array when text has no currency figures', () => {
    expect(extractFigureTokens('All scheduled events look healthy and safe.')).toEqual([]);
    expect(extractFigureTokens('')).toEqual([]);
  });

  it('captures duplicate currency tokens preserving occurrences', () => {
    const text = 'First fee was $25.00 and second fee was $25.00.';
    const tokens = extractFigureTokens(text);
    expect(tokens.length).toBe(2);
    expect(tokens[0]).toBe('$25.00');
    expect(tokens[1]).toBe('$25.00');
  });
});

describe('Provenance Verifier: findDerivedFormula', () => {
  const sources: FigureSource[] = [
    { cents: 248654, label: 'EQ Hub balance' }, // $2,486.54
    { cents: 320000, label: 'Transfer amount' }, // $3,200.00
    { cents: 435722, label: 'Chequing balance' }, // $4,357.22
    { cents: 10000, label: 'Fee A' }, // $100.00
    { cents: 20000, label: 'Fee B' }, // $200.00
    { cents: 30000, label: 'Fee C' }, // $300.00
  ];

  it('derives pair addition: a + b = target', () => {
    // $2,486.54 + $3,200.00 = $5,686.54 (568654 cents)
    const formula = findDerivedFormula(568654, sources);
    expect(formula).not.toBeNull();
    expect(formula).toMatch(/\$2,486\.54/);
    expect(formula).toMatch(/\$3,200\.00/);
    expect(formula).toMatch(/\$5,686\.54/);
    expect(formula).toContain('+');
    expect(formula).toContain('=');
  });

  it('derives pair subtraction: a - b = target', () => {
    // $4,357.22 - $3,200.00 = $1,157.22 (115722 cents)
    const formula = findDerivedFormula(115722, sources);
    expect(formula).not.toBeNull();
    expect(formula).toMatch(/\$4,357\.22/);
    expect(formula).toMatch(/\$3,200\.00/);
    expect(formula).toMatch(/\$1,157\.22/);
    expect(formula).toContain('-');
    expect(formula).toContain('=');
  });

  it('derives triple sum: a + b + c = target', () => {
    // $100.00 + $200.00 + $300.00 = $600.00 (60000 cents)
    const formula = findDerivedFormula(60000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toMatch(/\$100\.00/);
    expect(formula).toMatch(/\$200\.00/);
    expect(formula).toMatch(/\$300\.00/);
    expect(formula).toMatch(/\$600\.00/);
    expect(formula).toContain('=');
  });

  it('derives triple linear combination with addition and subtraction: a + b - c = target', () => {
    // $300.00 + $200.00 - $100.00 = $400.00 (40000 cents)
    const formula = findDerivedFormula(40000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toMatch(/\$400\.00/);
    expect(formula).toContain('=');
  });

  it('returns null when no pair or triple combination matches', () => {
    // $999.99 (99999 cents) cannot be derived from sources
    expect(findDerivedFormula(99999, sources)).toBeNull();
    // Fabricated figure from session: $2,825.00 (282500 cents)
    expect(findDerivedFormula(282500, sources)).toBeNull();
    // Fabricated figure from session: $869.08 (86908 cents)
    expect(findDerivedFormula(86908, sources)).toBeNull();
  });

  it('returns null when sources list is empty or has fewer than 2 sources', () => {
    expect(findDerivedFormula(568654, [])).toBeNull();
    expect(findDerivedFormula(568654, [{ cents: 248654, label: 'Only one' }])).toBeNull();
  });
});

describe('Provenance Verifier: classifyMessageFigures', () => {
  const sources: FigureSource[] = [
    { cents: 435722, label: 'Main Chequing · balance now' },
    { cents: 248654, label: 'EQ Hub · balance now' },
    { cents: 320000, label: 'Transfer R Chequing → EQ Hub' },
    { cents: -121192, label: 'R Chequing · lowest projected balance' },
    { cents: -11373, label: 'Simulated floor buffer' },
    { cents: 330000, label: 'Simulated deposit' },
    { cents: 50000, label: 'Target floor' },
  ];

  it('classifies exact engine figures with source label', () => {
    const text = 'Your current balance is $4,357.22 and target floor is $500.00.';
    const result = classifyMessageFigures(text, sources, []);

    expect(result.totalFigures).toBe(2);
    expect(result.unverifiedCount).toBe(0);

    const chq = result.figures.find((f) => f.cents === 435722);
    expect(chq).toBeDefined();
    expect(chq?.classification).toBe('engine');
    expect(chq?.sourceLabel).toContain('Main Chequing · balance now');

    const floor = result.figures.find((f) => f.cents === 50000);
    expect(floor).toBeDefined();
    expect(floor?.classification).toBe('engine');
    expect(floor?.sourceLabel).toContain('Target floor');
  });

  it('classifies derived arithmetic figures with formula', () => {
    // $2,486.54 + $3,200.00 = $5,686.54
    const text = 'Total liquid across EQ Hub after transfer will be $5,686.54.';
    const result = classifyMessageFigures(text, sources, []);

    expect(result.totalFigures).toBe(1);
    expect(result.unverifiedCount).toBe(0);

    const derived = result.figures[0];
    expect(derived.classification).toBe('derived');
    expect(derived.cents).toBe(568654);
    expect(derived.formula).toBeDefined();
    expect(derived.formula).toContain('= $5,686.54');
  });

  it('classifies user-stated figures from conversation history', () => {
    const userMessages = [
      'I got an unexpected bonus of $1,500.00 yesterday.',
      'Also spent $45.00 on dinner.',
    ];
    const text = 'Noted your bonus of $1,500.00 and $45.00 expense.';
    const result = classifyMessageFigures(text, sources, userMessages);

    expect(result.totalFigures).toBe(2);
    expect(result.unverifiedCount).toBe(0);

    const bonus = result.figures.find((f) => f.cents === 150000);
    expect(bonus?.classification).toBe('user_stated');

    const dinner = result.figures.find((f) => f.cents === 4500);
    expect(dinner?.classification).toBe('user_stated');
  });

  it('classifies unknown and fabricated figures as unverified', () => {
    const text = 'You will have $2,825.00 remaining, with an overdraft of -$1,430.92 and cushion of $869.08.';
    const result = classifyMessageFigures(text, sources, []);

    expect(result.totalFigures).toBe(3);
    expect(result.unverifiedCount).toBe(3);

    expect(result.figures.every((f) => f.classification === 'unverified')).toBe(true);
  });

  it('enforces precedence hierarchy: engine > derived > user_stated > unverified', () => {
    // Stated in user message AND also in engine sources:
    const userMessages = ['I have $4,357.22 in Chequing.'];
    const text = 'Your Chequing balance is $4,357.22.';
    const result = classifyMessageFigures(text, sources, userMessages);

    expect(result.totalFigures).toBe(1);
    // Engine must win over user_stated
    expect(result.figures[0].classification).toBe('engine');
    expect(result.figures[0].sourceLabel).toBeDefined();
  });

  it('handles messages with zero figures gracefully', () => {
    const text = 'Everything looks on track with no action needed.';
    const result = classifyMessageFigures(text, sources, []);

    expect(result.totalFigures).toBe(0);
    expect(result.unverifiedCount).toBe(0);
    expect(result.figures).toEqual([]);
  });
});

describe('Provenance Verifier: Golden Session Benchmark (Zero False Positives)', () => {
  // Authoritative figures from the target real-world user session in ORIGINAL_REQUEST.md
  const sessionSources: FigureSource[] = [
    { cents: 435722, label: 'R Chequing starting balance' }, // $4,357.22
    { cents: 248654, label: 'EQ Hub starting balance' }, // $2,486.54
    { cents: 320000, label: 'Transfer R Chequing → EQ Hub' }, // $3,200.00
    { cents: -121192, label: 'R Chequing lowest balance Oct 21' }, // -$1,211.92
    { cents: -11373, label: 'Simulated floor margin Oct 21' }, // -$113.73
    { cents: 330000, label: 'Simulated deposit' }, // $3,300.00
  ];

  const userMessages = [
    'I transferred $3,200 from Chequing to EQ Hub yesterday.',
  ];

  it('achieves 0 false positives on session benchmark figures (-$1,211.92, $3,300.00, -$113.73, $5,686.54)', () => {
    const assistantMessage =
      'Your lowest projected balance is -$1,211.92 on Oct 21. If you deposit $3,300.00, your buffer will be -$113.73. Together with your existing EQ Hub funds, total liquid is $5,686.54.';

    const result = classifyMessageFigures(assistantMessage, sessionSources, userMessages);

    // Assert total count
    expect(result.totalFigures).toBe(4);
    // ZERO FALSE POSITIVES: exactly zero unverified figures
    expect(result.unverifiedCount).toBe(0);

    const f1211 = result.figures.find((f) => f.cents === -121192);
    expect(f1211).toBeDefined();
    expect(f1211?.classification).toBe('engine');

    const f3300 = result.figures.find((f) => f.cents === 330000);
    expect(f3300).toBeDefined();
    expect(f3300?.classification).toBe('engine');

    const f113 = result.figures.find((f) => f.cents === -11373);
    expect(f113).toBeDefined();
    expect(f113?.classification).toBe('engine');

    const f5686 = result.figures.find((f) => f.cents === 568654);
    expect(f5686).toBeDefined();
    expect(f5686?.classification).toBe('derived');
    expect(f5686?.formula).toContain('$2,486.54');
    expect(f5686?.formula).toContain('$3,200.00');
  });

  it('flags 100% of hallucinated session figures ($2,825.00, -$1,430.92, $869.08) as unverified', () => {
    const hallucinatedMessage =
      'Your new balance will be $2,825.00, dropping to -$1,430.92 with $869.08 remaining.';

    const result = classifyMessageFigures(hallucinatedMessage, sessionSources, userMessages);

    expect(result.totalFigures).toBe(3);
    expect(result.unverifiedCount).toBe(3);

    const f2825 = result.figures.find((f) => f.cents === 282500);
    expect(f2825?.classification).toBe('unverified');

    const f1430 = result.figures.find((f) => f.cents === -143092);
    expect(f1430?.classification).toBe('unverified');

    const f869 = result.figures.find((f) => f.cents === 86908);
    expect(f869?.classification).toBe('unverified');
  });

  it('correctly classifies a mixed response with engine, derived, user-stated, and unverified figures', () => {
    const mixedUserHistory = [
      ...userMessages,
      'I also have $450.00 in a petty cash envelope.',
    ];

    const mixedMessage =
      'Lowest is -$1,211.92, total EQ is $5,686.54, petty cash is $450.00, but I hallucinated $2,825.00.';

    const result = classifyMessageFigures(mixedMessage, sessionSources, mixedUserHistory);

    expect(result.totalFigures).toBe(4);
    expect(result.unverifiedCount).toBe(1);

    expect(result.figures.find((f) => f.cents === -121192)?.classification).toBe('engine');
    expect(result.figures.find((f) => f.cents === 568654)?.classification).toBe('derived');
    expect(result.figures.find((f) => f.cents === 45000)?.classification).toBe('user_stated');
    expect(result.figures.find((f) => f.cents === 282500)?.classification).toBe('unverified');
  });
});
