import { describe, it, expect } from 'vitest';
import {
  parseFigureCents,
  formatFigureCents,
  extractFigureTokens,
  findDerivedFormula,
  classifyFigure,
  classifyMessageFigures,
} from '../provenance';
import { FigureSource } from '../toolkit';

describe('Empirical Challenger M2 Fresh: 1. Pairs Arithmetic Derivations', () => {
  const sources: FigureSource[] = [
    { cents: 250000, label: 'Chequing ($2,500.00)' },
    { cents: 120000, label: 'Rent ($1,200.00)' },
    { cents: 45050, label: 'Hydro ($450.50)' },
    { cents: 31025, label: 'Internet ($310.25)' },
  ];

  it('verifies a + b derivation and validates LHS formula equivalence', () => {
    // 250000 + 120000 = 370000 ($3,700.00)
    const formula = findDerivedFormula(370000, sources);
    expect(formula).toBe('$2,500.00 + $1,200.00 = $3,700.00');
  });

  it('verifies a - b derivation and validates LHS formula equivalence', () => {
    // 250000 - 120000 = 130000 ($1,300.00)
    const formula = findDerivedFormula(130000, sources);
    expect(formula).toBe('$2,500.00 - $1,200.00 = $1,300.00');
  });

  it('verifies b - a derivation yielding negative balance', () => {
    // 120000 - 250000 = -130000 (-$1,300.00)
    const formula = findDerivedFormula(-130000, sources);
    expect(formula).toBe('$1,200.00 - $2,500.00 = -$1,300.00');
  });

  it('verifies -a - b negative sum derivation', () => {
    // -120000 - 45050 = -165050 (-$1,650.50)
    const formula = findDerivedFormula(-165050, sources);
    expect(formula).toBe('-$1,200.00 - $450.50 = -$1,650.50');
  });

  it('verifies mixed cents arithmetic with exact cent precision', () => {
    // 45050 + 31025 = 76075 ($760.75)
    expect(findDerivedFormula(76075, sources)).toBe('$450.50 + $310.25 = $760.75');

    // 45050 - 31025 = 14025 ($140.25)
    expect(findDerivedFormula(14025, sources)).toBe('$450.50 - $310.25 = $140.25');

    // 31025 - 45050 = -14025 (-$140.25)
    expect(findDerivedFormula(-14025, sources)).toBe('$310.25 - $450.50 = -$140.25');
  });
});

describe('Empirical Challenger M2 Fresh: 2. Triples Arithmetic Derivations (All 8 Sign Combinations)', () => {
  const sources: FigureSource[] = [
    { cents: 500000, label: 'Salary ($5,000)' },
    { cents: 200000, label: 'Rent ($2,000)' },
    { cents: 70000, label: 'Groceries ($700)' },
  ];

  it('1/8: (+a + b + c)', () => {
    // 5000 + 2000 + 700 = 7700 ($7,700.00)
    expect(findDerivedFormula(770000, sources)).toBe('$5,000.00 + $2,000.00 + $700.00 = $7,700.00');
  });

  it('2/8: (+a + b - c)', () => {
    // 5000 + 2000 - 700 = 6300 ($6,300.00)
    expect(findDerivedFormula(630000, sources)).toBe('$5,000.00 + $2,000.00 - $700.00 = $6,300.00');
  });

  it('3/8: (+a - b + c)', () => {
    // 5000 - 2000 + 700 = 3700 ($3,700.00)
    expect(findDerivedFormula(370000, sources)).toBe('$5,000.00 + $700.00 - $2,000.00 = $3,700.00');
  });

  it('4/8: (+a - b - c)', () => {
    // 5000 - 2000 - 700 = 2300 ($2,300.00)
    expect(findDerivedFormula(230000, sources)).toBe('$5,000.00 - $2,000.00 - $700.00 = $2,300.00');
  });

  it('5/8: (-a + b + c)', () => {
    // -5000 + 2000 + 700 = -2300 (-$2,300.00)
    expect(findDerivedFormula(-230000, sources)).toBe('$2,000.00 + $700.00 - $5,000.00 = -$2,300.00');
  });

  it('6/8: (-a + b - c)', () => {
    // -5000 + 2000 - 700 = -3700 (-$3,700.00)
    expect(findDerivedFormula(-370000, sources)).toBe('$2,000.00 - $5,000.00 - $700.00 = -$3,700.00');
  });

  it('7/8: (-a - b + c)', () => {
    // -5000 - 2000 + 700 = -6300 (-$6,300.00)
    expect(findDerivedFormula(-630000, sources)).toBe('$700.00 - $5,000.00 - $2,000.00 = -$6,300.00');
  });

  it('8/8: (-a - b - c)', () => {
    // -5000 - 2000 - 700 = -7700 (-$7,700.00)
    expect(findDerivedFormula(-770000, sources)).toBe('-$5,000.00 - $2,000.00 - $700.00 = -$7,700.00');
  });
});

describe('Empirical Challenger M2 Fresh: 3. Anti-Self-Derivation & Distinct Sources Invariant', () => {
  it('proves a single source CANNOT derive pairs, triples, or self-cancellation', () => {
    const singleSource: FigureSource[] = [{ cents: 50000, label: 'Lone Account ($500.00)' }];

    // $500 * 2 = $1,000
    expect(findDerivedFormula(100000, singleSource)).toBeNull();
    // $500 * 3 = $1,500
    expect(findDerivedFormula(150000, singleSource)).toBeNull();
    // $500 - $500 = $0
    expect(findDerivedFormula(0, singleSource)).toBeNull();
    // -$500 - $500 = -$1,000
    expect(findDerivedFormula(-100000, singleSource)).toBeNull();

    // Classification confirms unverified
    expect(classifyFigure('$1,000.00', singleSource, []).classification).toBe('unverified');
    expect(classifyFigure('$1,500.00', singleSource, []).classification).toBe('unverified');
  });

  it('proves exactly 2 sources with identical values can derive pair, but NOT triple', () => {
    const twoSources: FigureSource[] = [
      { cents: 50000, label: 'Chequing' },
      { cents: 50000, label: 'Savings' },
    ];

    // Allowed pair: 500 + 500 = 1000
    expect(findDerivedFormula(100000, twoSources)).toBe('$500.00 + $500.00 = $1,000.00');
    // Forbidden triple: 500 * 3 = 1500
    expect(findDerivedFormula(150000, twoSources)).toBeNull();
    expect(classifyFigure('$1,500.00', twoSources, []).classification).toBe('unverified');
  });

  it('proves exactly 3 sources with identical values can derive triple, but NOT quadruple', () => {
    const threeSources: FigureSource[] = [
      { cents: 50000, label: 'Jar A' },
      { cents: 50000, label: 'Jar B' },
      { cents: 50000, label: 'Jar C' },
    ];

    expect(findDerivedFormula(150000, threeSources)).toBe('$500.00 + $500.00 + $500.00 = $1,500.00');
    // Quadruple is not supported (null)
    expect(findDerivedFormula(200000, threeSources)).toBeNull();
  });

  it('proves zero-cents sources are excluded from derivation pool to prevent degenerate a + 0 = a', () => {
    const withZero: FigureSource[] = [
      { cents: 435722, label: 'Account' },
      { cents: 0, label: 'Zero balance' },
    ];

    // Cannot derive 435722 from 435722 + 0
    expect(findDerivedFormula(435722, withZero)).toBeNull();
  });
});

describe('Empirical Challenger M2 Fresh: 4. Extreme Figures, Edge Cases & Performance Bound', () => {
  it('handles sub-dollar figures and 1-cent increments', () => {
    expect(parseFigureCents('$0.01')).toBe(1);
    expect(parseFigureCents('-$0.01')).toBe(-1);
    expect(formatFigureCents(1)).toBe('$0.01');
    expect(formatFigureCents(-1)).toBe('-$0.01');

    const centSources: FigureSource[] = [
      { cents: 1, label: 'One cent' },
      { cents: 2, label: 'Two cents' },
    ];
    expect(findDerivedFormula(3, centSources)).toBe('$0.01 + $0.02 = $0.03');
  });

  it('handles multi-million figures without overflow or precision loss', () => {
    const millionSources: FigureSource[] = [
      { cents: 1000000000, label: 'Treasury ($10,000,000)' },
      { cents: 250000000, label: 'Grant ($2,500,000)' },
    ];
    expect(findDerivedFormula(1250000000, millionSources)).toBe('$10,000,000.00 + $2,500,000.00 = $12,500,000.00');
  });

  it('bounds execution time with 60 sources to sub-50ms', () => {
    const largeSources: FigureSource[] = Array.from({ length: 60 }, (_, i) => ({
      cents: (i + 1) * 10000,
      label: `Src ${i}`,
    }));

    const start = performance.now();
    // First 3 sources: 100 + 200 + 300 = 600 ($600.00 -> 60000 cents)
    const res = findDerivedFormula(60000, largeSources);
    const elapsed = performance.now() - start;

    expect(res).not.toBeNull();
    expect(elapsed).toBeLessThan(50);
  });
});

describe('Empirical Challenger M2 Fresh: 5. Session Benchmark (0 False Positives & 100% Hallucination Detection)', () => {
  const sessionSources: FigureSource[] = [
    { cents: 435722, label: 'R Chequing starting balance' },
    { cents: 248654, label: 'EQ Hub starting balance' },
    { cents: 320000, label: 'Transfer R Chequing → EQ Hub' },
    { cents: -121192, label: 'R Chequing lowest balance Oct 21' },
    { cents: -11373, label: 'Simulated floor margin Oct 21' },
    { cents: 330000, label: 'Simulated deposit' },
  ];

  const userMessages = ['I transferred $3,200 from Chequing to EQ Hub yesterday.'];

  it('verifies 100% of session benchmark figures with 0 false positives', () => {
    const validMessage =
      'Your lowest projected balance is -$1,211.92. You plan to deposit $3,300.00, leaving a buffer of -$113.73. EQ Hub total will reach $5,686.54.';

    const result = classifyMessageFigures(validMessage, sessionSources, userMessages);

    expect(result.totalFigures).toBe(4);
    // 0 FALSE POSITIVES:
    expect(result.unverifiedCount).toBe(0);

    expect(result.figures.find((f) => f.cents === -121192)?.classification).toBe('engine');
    expect(result.figures.find((f) => f.cents === 330000)?.classification).toBe('engine');
    expect(result.figures.find((f) => f.cents === -11373)?.classification).toBe('engine');
    expect(result.figures.find((f) => f.cents === 568654)?.classification).toBe('derived');
  });

  it('flags 100% of fabricated figures as unverified', () => {
    const hallucinatedMessage =
      'I predict your ending balance will be $2,825.00, with an overdraft of -$1,430.92 and cushion of $869.08.';

    const result = classifyMessageFigures(hallucinatedMessage, sessionSources, userMessages);

    expect(result.totalFigures).toBe(3);
    // 100% DETECTED:
    expect(result.unverifiedCount).toBe(3);
    expect(result.figures.every((f) => f.classification === 'unverified')).toBe(true);
  });
});

describe('Empirical Challenger M2 Fresh: 6. Precedence Hierarchy and Token Extraction', () => {
  it('enforces engine > derived > user_stated > unverified', () => {
    const sources: FigureSource[] = [
      { cents: 10000, label: 'Source 1' },
      { cents: 20000, label: 'Source 2' },
      { cents: 30000, label: 'Source 3 (exact)' },
    ];
    // $300.00 is in engine AND can be derived from $100 + $200 AND in user messages:
    const userMessages = ['I have $300.00.'];
    const res = classifyFigure('$300.00', sources, userMessages);
    expect(res.classification).toBe('engine');
  });

  it('rejects dates and plain integer counts', () => {
    const text = 'On 2026-10-15 there are 4 accounts with total $500.00.';
    const tokens = extractFigureTokens(text);
    expect(tokens).toEqual(['$500.00']);
  });
});

describe('Empirical Challenger M2 Fresh: 7. Randomized Oracle Stress Harness (250 Scenarios)', () => {
  function independentOracle(targetCents: number, poolCents: number[]): boolean {
    const absPool = poolCents.map((c) => Math.abs(c)).filter((c) => c !== 0);

    // Pairs
    for (let i = 0; i < absPool.length; i++) {
      for (let j = i + 1; j < absPool.length; j++) {
        const a = absPool[i];
        const b = absPool[j];
        if (a + b === targetCents || a - b === targetCents || b - a === targetCents || -a - b === targetCents) {
          return true;
        }
      }
    }

    // Triples (capped at first 40)
    const tPool = absPool.slice(0, 40);
    for (let i = 0; i < tPool.length; i++) {
      for (let j = i + 1; j < tPool.length; j++) {
        for (let k = j + 1; k < tPool.length; k++) {
          const a = tPool[i];
          const b = tPool[j];
          const c = tPool[k];
          if (
            a + b + c === targetCents ||
            a + b - c === targetCents ||
            a - b + c === targetCents ||
            a - b - c === targetCents ||
            -a + b + c === targetCents ||
            -a + b - c === targetCents ||
            -a - b + c === targetCents ||
            -a - b - c === targetCents
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  it('runs 250 randomized test scenarios and validates exact agreement with independent mathematical oracle', () => {
    let lcg = 1337;
    const rand = () => {
      lcg = (lcg * 1664525 + 1013904223) >>> 0;
      return lcg / 4294967296;
    };

    for (let iter = 1; iter <= 250; iter++) {
      const numSources = 2 + Math.floor(rand() * 8); // 2 to 9 sources
      const rawValues: number[] = [];
      const sources: FigureSource[] = [];

      for (let s = 0; s < numSources; s++) {
        const val = Math.floor(rand() * 100000) + 10;
        rawValues.push(val);
        sources.push({ cents: val, label: `Source ${s}` });
      }

      let candidateTarget: number;
      if (iter % 2 === 0) {
        // True combination
        const a = rawValues[0];
        const b = rawValues[1];
        candidateTarget = iter % 4 === 0 ? a + b : a - b;
      } else {
        // Random number
        candidateTarget = Math.floor(rand() * 200000) + 5;
      }

      const expected = independentOracle(candidateTarget, rawValues);
      const formula = findDerivedFormula(candidateTarget, sources);

      if (expected) {
        expect(formula).not.toBeNull();
        expect(formula).toContain(`= ${formatFigureCents(candidateTarget)}`);
      } else {
        expect(formula).toBeNull();
      }
    }
  });
});
