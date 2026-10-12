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

describe('M2 Empirical Challenger: 1. Pairs Arithmetic Derivations', () => {
  const sources: FigureSource[] = [
    { cents: 250000, label: 'Main Chequing' }, // $2,500.00
    { cents: 120000, label: 'Rent Outflow' },   // $1,200.00
    { cents: 45050, label: 'Utility Bill' },    // $450.50
    { cents: 31025, label: 'Internet Bill' },   // $310.25
  ];

  it('derives positive addition: a + b = target', () => {
    // $2,500.00 + $1,200.00 = $3,700.00 (370000 cents)
    const formula = findDerivedFormula(370000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$2,500.00 + $1,200.00 = $3,700.00');
  });

  it('derives positive subtraction: a - b = target', () => {
    // $2,500.00 - $1,200.00 = $1,300.00 (130000 cents)
    const formula = findDerivedFormula(130000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$2,500.00 - $1,200.00 = $1,300.00');
  });

  it('derives negative subtraction: b - a = target (negative result)', () => {
    // $1,200.00 - $2,500.00 = -$1,300.00 (-130000 cents)
    const formula = findDerivedFormula(-130000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$1,200.00 - $2,500.00 = -$1,300.00');
  });

  it('derives negative sum: -a - b = target', () => {
    // -$1,200.00 - $450.50 = -$1,650.50 (-165050 cents)
    const formula = findDerivedFormula(-165050, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('-$1,200.00 - $450.50 = -$1,650.50');
  });

  it('derives mixed cents addition with exact precision', () => {
    // $450.50 + $310.25 = $760.75 (76075 cents)
    const formula = findDerivedFormula(76075, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$450.50 + $310.25 = $760.75');
  });

  it('derives mixed cents subtraction with exact precision', () => {
    // $450.50 - $310.25 = $140.25 (14025 cents)
    const formula = findDerivedFormula(14025, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$450.50 - $310.25 = $140.25');
  });
});

describe('M2 Empirical Challenger: 2. Triples Arithmetic Derivations (All 8 Sign Combinations)', () => {
  const sources: FigureSource[] = [
    { cents: 500000, label: 'Source A ($5,000)' },
    { cents: 200000, label: 'Source B ($2,000)' },
    { cents: 70000, label: 'Source C ($700)' },
  ];

  it('derives triple (1/8): +a + b + c', () => {
    // 5000 + 2000 + 700 = 7700 (770000 cents)
    const formula = findDerivedFormula(770000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$5,000.00 + $2,000.00 + $700.00 = $7,700.00');
  });

  it('derives triple (2/8): +a + b - c', () => {
    // 5000 + 2000 - 700 = 6300 (630000 cents)
    const formula = findDerivedFormula(630000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$5,000.00 + $2,000.00 - $700.00 = $6,300.00');
  });

  it('derives triple (3/8): +a - b + c', () => {
    // 5000 - 2000 + 700 = 3700 (370000 cents)
    const formula = findDerivedFormula(370000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$5,000.00 + $700.00 - $2,000.00 = $3,700.00');
  });

  it('derives triple (4/8): +a - b - c', () => {
    // 5000 - 2000 - 700 = 2300 (230000 cents)
    const formula = findDerivedFormula(230000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$5,000.00 - $2,000.00 - $700.00 = $2,300.00');
  });

  it('derives triple (5/8): -a + b + c', () => {
    // -5000 + 2000 + 700 = -2300 (-230000 cents)
    // Formula format: $2,000.00 + $700.00 - $5,000.00 = -$2,300.00
    const formula = findDerivedFormula(-230000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$2,000.00 + $700.00 - $5,000.00 = -$2,300.00');
  });

  it('derives triple (6/8): -a + b - c', () => {
    // -5000 + 2000 - 700 = -3700 (-370000 cents)
    // Formula format: $2,000.00 - $5,000.00 - $700.00 = -$3,700.00
    const formula = findDerivedFormula(-370000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$2,000.00 - $5,000.00 - $700.00 = -$3,700.00');
  });

  it('derives triple (7/8): -a - b + c', () => {
    // -5000 - 2000 + 700 = -6300 (-630000 cents)
    // Formula format: $700.00 - $5,000.00 - $2,000.00 = -$6,300.00
    const formula = findDerivedFormula(-630000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('$700.00 - $5,000.00 - $2,000.00 = -$6,300.00');
  });

  it('derives triple (8/8): -a - b - c', () => {
    // -5000 - 2000 - 700 = -7700 (-770000 cents)
    const formula = findDerivedFormula(-770000, sources);
    expect(formula).not.toBeNull();
    expect(formula).toBe('-$5,000.00 - $2,000.00 - $700.00 = -$7,700.00');
  });

  it('handles large pool (50 sources) without performance degradation or infinite loops', () => {
    const largePool: FigureSource[] = Array.from({ length: 50 }, (_, i) => ({
      cents: (i + 1) * 10000,
      label: `Account ${i + 1}`,
    }));

    const startTime = performance.now();
    // Search a triple within the capped pool (first 40 items)
    // a = 100, b = 200, c = 300 -> 600 (60000 cents)
    const found = findDerivedFormula(60000, largePool);
    const duration = performance.now() - startTime;

    expect(found).not.toBeNull();
    expect(duration).toBeLessThan(100); // Must execute comfortably in sub-100ms
  });
});

describe('M2 Empirical Challenger: 3. Distinct Sources & Anti-Self-Derivation Invariant', () => {
  it('strictly forbids a single source from deriving pairs or triples of itself', () => {
    const singleSource: FigureSource[] = [
      { cents: 50000, label: 'Single Account Balance' }, // $500.00
    ];

    // Self-pair: $500 + $500 = $1,000
    expect(findDerivedFormula(100000, singleSource)).toBeNull();

    // Self-triple: $500 + $500 + $500 = $1,500
    expect(findDerivedFormula(150000, singleSource)).toBeNull();

    // Self-cancellation: $500 - $500 = $0
    expect(findDerivedFormula(0, singleSource)).toBeNull();

    // In classifier, $1,000 and $1,500 must be unverified
    const c1000 = classifyFigure('$1,000.00', singleSource, []);
    expect(c1000.classification).toBe('unverified');

    const c1500 = classifyFigure('$1,500.00', singleSource, []);
    expect(c1500.classification).toBe('unverified');
  });

  it('permits 2 identical-value sources to derive a pair, but NOT a triple', () => {
    const twoIdenticalSources: FigureSource[] = [
      { cents: 50000, label: 'Savings Account 1' }, // $500.00
      { cents: 50000, label: 'Savings Account 2' }, // $500.00
    ];

    // Two distinct sources of $500 can derive $1,000 (a + b)
    const f1000 = findDerivedFormula(100000, twoIdenticalSources);
    expect(f1000).not.toBeNull();
    expect(f1000).toBe('$500.00 + $500.00 = $1,000.00');

    // Two distinct sources CANNOT derive $1,500 ($500 * 3) because triple requires 3 distinct sources
    const f1500 = findDerivedFormula(150000, twoIdenticalSources);
    expect(f1500).toBeNull();

    const c1500 = classifyFigure('$1,500.00', twoIdenticalSources, []);
    expect(c1500.classification).toBe('unverified');
  });

  it('permits 3 identical-value sources to derive a triple, but NOT a quadruple', () => {
    const threeIdenticalSources: FigureSource[] = [
      { cents: 50000, label: 'Envelope A' },
      { cents: 50000, label: 'Envelope B' },
      { cents: 50000, label: 'Envelope C' },
    ];

    // 3 distinct sources can derive $1,500
    const f1500 = findDerivedFormula(150000, threeIdenticalSources);
    expect(f1500).not.toBeNull();
    expect(f1500).toBe('$500.00 + $500.00 + $500.00 = $1,500.00');

    // 3 distinct sources cannot derive $2,000 ($500 * 4)
    expect(findDerivedFormula(200000, threeIdenticalSources)).toBeNull();
  });

  it('strictly ignores zero-value sources from derivation pool', () => {
    const sourcesWithZero: FigureSource[] = [
      { cents: 50000, label: 'Chequing' }, // $500.00
      { cents: 0, label: 'Zero Balance' },   // $0.00
    ];

    // Cannot derive $500 from $500 + $0
    expect(findDerivedFormula(50000, sourcesWithZero)).toBeNull();
  });
});

describe('M2 Empirical Challenger: 4. Extreme Figures & Precision Stress Test', () => {
  it('accurately parses and formats sub-dollar and negative cent figures', () => {
    expect(parseFigureCents('$0.01')).toBe(1);
    expect(parseFigureCents('-$0.01')).toBe(-1);
    expect(formatFigureCents(1)).toBe('$0.01');
    expect(formatFigureCents(-1)).toBe('-$0.01');

    expect(parseFigureCents('$0.00')).toBe(0);
    expect(parseFigureCents('-$0.00')).toBe(0);
    expect(formatFigureCents(0)).toBe('$0.00');
  });

  it('accurately parses and formats figures in millions of dollars', () => {
    expect(parseFigureCents('$1,000,000.00')).toBe(100000000);
    expect(parseFigureCents('-$1,000,000.00')).toBe(-100000000);
    expect(formatFigureCents(100000000)).toBe('$1,000,000.00');
    expect(formatFigureCents(-100000000)).toBe('-$1,000,000.00');

    expect(parseFigureCents('$12,345,678.90')).toBe(1234567890);
    expect(formatFigureCents(1234567890)).toBe('$12,345,678.90');
  });

  it('derives multi-million combinations without integer overflow or float drift', () => {
    const sources: FigureSource[] = [
      { cents: 1000000000, label: 'Fund A ($10M)' },
      { cents: 250000000, label: 'Fund B ($2.5M)' },
    ];

    // $10,000,000.00 + $2,500,000.00 = $12,500,000.00 (1250000000 cents)
    const formula = findDerivedFormula(1250000000, sources);
    expect(formula).toBe('$10,000,000.00 + $2,500,000.00 = $12,500,000.00');
  });

  it('avoids IEEE-754 floating point arithmetic trap (0.1 + 0.2 cents)', () => {
    const sources: FigureSource[] = [
      { cents: 10, label: '10 cents' },
      { cents: 20, label: '20 cents' },
    ];

    // 10 cents + 20 cents = 30 cents ($0.30)
    const formula = findDerivedFormula(30, sources);
    expect(formula).toBe('$0.10 + $0.20 = $0.30');
  });

  it('recognizes symmetric engine figures with inverted signs (e.g. transfer outflow vs inflow)', () => {
    const sources: FigureSource[] = [
      { cents: 320000, label: 'Transfer Outflow ($3,200)' },
    ];

    // Exact match for -$3,200.00 matches opposite sign
    const negClassification = classifyFigure('-$3,200.00', sources, []);
    expect(negClassification.classification).toBe('engine');
    expect(negClassification.sourceLabel).toBe('Transfer Outflow ($3,200)');

    // Positive figure also matches
    const posClassification = classifyFigure('$3,200.00', sources, []);
    expect(posClassification.classification).toBe('engine');
  });
});

describe('M2 Empirical Challenger: 5. Adversarial Token Extraction & False Token Filtering', () => {
  it('rejects dates (YYYY-MM-DD, MM-DD, YYYY) and does not treat them as figures', () => {
    const text = 'On 2026-10-15 and 2026-10-21, your projected balance changes by $500.00.';
    const tokens = extractFigureTokens(text);
    expect(tokens).toEqual(['$500.00']);
  });

  it('rejects plain counts and years without dollar signs or decimal currency cents', () => {
    const text = 'You have 3 accounts and 14 upcoming events in year 2026 with total $1,250.00.';
    const tokens = extractFigureTokens(text);
    expect(tokens).toEqual(['$1,250.00']);
  });

  it('rejects malformed and non-numeric tokens', () => {
    expect(parseFigureCents('')).toBeNull();
    expect(parseFigureCents('   ')).toBeNull();
    expect(parseFigureCents('$')).toBeNull();
    expect(parseFigureCents('-')).toBeNull();
    expect(parseFigureCents('--$50.00')).toBeNull();
    expect(parseFigureCents('2026-10-15')).toBeNull();
    expect(parseFigureCents('abc')).toBeNull();
  });

  it('correctly handles punctuation borders and parenthetical figures', () => {
    const text = 'Lowest balance: ($1,211.92). Target floor: [$500.00]! Margin: -$113.73?';
    const tokens = extractFigureTokens(text);
    expect(tokens.length).toBe(3);

    const parsed = tokens.map((t) => parseFigureCents(t));
    expect(parsed).toEqual([121192, 50000, -11373]);
  });
});

describe('M2 Empirical Challenger: 6. Session Benchmark Verification (0 False Positives & 100% Hallucination Catch)', () => {
  const sessionSources: FigureSource[] = [
    { cents: 435722, label: 'R Chequing starting balance' },       // $4,357.22
    { cents: 248654, label: 'EQ Hub starting balance' },           // $2,486.54
    { cents: 320000, label: 'Transfer R Chequing → EQ Hub' },      // $3,200.00
    { cents: -121192, label: 'R Chequing lowest balance Oct 21' }, // -$1,211.92
    { cents: -11373, label: 'Simulated floor margin Oct 21' },     // -$113.73
    { cents: 330000, label: 'Simulated deposit' },                 // $3,300.00
  ];

  const userMessages = [
    'I transferred $3,200 from Chequing to EQ Hub yesterday.',
  ];

  it('guarantees 0 false positives on all 4 authoritative session figures', () => {
    // The 4 authoritative session figures: -$1,211.92, $3,300.00, -$113.73, $5,686.54
    const text =
      'Your lowest projected balance is -$1,211.92. You plan to deposit $3,300.00, leaving a buffer of -$113.73. EQ Hub total will reach $5,686.54.';

    const result = classifyMessageFigures(text, sessionSources, userMessages);

    expect(result.totalFigures).toBe(4);
    // 0 FALSE POSITIVES
    expect(result.unverifiedCount).toBe(0);

    const f1211 = result.figures.find((f) => f.cents === -121192);
    expect(f1211?.classification).toBe('engine');

    const f3300 = result.figures.find((f) => f.cents === 330000);
    expect(f3300?.classification).toBe('engine');

    const f113 = result.figures.find((f) => f.cents === -11373);
    expect(f113?.classification).toBe('engine');

    const f5686 = result.figures.find((f) => f.cents === 568654);
    expect(f5686?.classification).toBe('derived');
    expect(f5686?.formula).toBe('$2,486.54 + $3,200.00 = $5,686.54');
  });

  it('guarantees 100% detection of all 3 fabricated hallucinated session figures', () => {
    // Fabricated hallucinated figures: $2,825.00, -$1,430.92, $869.08
    const hallucinatedText =
      'I estimate your balance will be $2,825.00 with a deficit of -$1,430.92 and cushion of $869.08.';

    const result = classifyMessageFigures(hallucinatedText, sessionSources, userMessages);

    expect(result.totalFigures).toBe(3);
    // 100% FLAGGED AS UNVERIFIED
    expect(result.unverifiedCount).toBe(3);

    const f2825 = result.figures.find((f) => f.cents === 282500);
    expect(f2825?.classification).toBe('unverified');

    const f1430 = result.figures.find((f) => f.cents === -143092);
    expect(f1430?.classification).toBe('unverified');

    const f869 = result.figures.find((f) => f.cents === 86908);
    expect(f869?.classification).toBe('unverified');
  });

  it('accurately partitions mixed messages containing all 4 valid and all 3 fabricated figures', () => {
    const combinedMessage = `
      Valid session numbers:
      - Lowest balance: -$1,211.92
      - Deposit: $3,300.00
      - Buffer: -$113.73
      - Combined liquid: $5,686.54
      
      Hallucinated claims:
      - Fake cushion: $2,825.00
      - Fake deficit: -$1,430.92
      - Fake leftover: $869.08
    `;

    const result = classifyMessageFigures(combinedMessage, sessionSources, userMessages);

    expect(result.totalFigures).toBe(7);
    expect(result.unverifiedCount).toBe(3);

    const verified = result.figures.filter((f) => f.classification !== 'unverified');
    expect(verified.length).toBe(4);
    expect(verified.map((f) => f.cents)).toEqual([-121192, 330000, -11373, 568654]);

    const unverified = result.figures.filter((f) => f.classification === 'unverified');
    expect(unverified.length).toBe(3);
    expect(unverified.map((f) => f.cents)).toEqual([282500, -143092, 86908]);
  });
});

describe('M2 Empirical Challenger: 7. Randomized Oracle Stress Harness (100 Scenarios)', () => {
  // Independent brute-force oracle
  function oracleDerivable(targetCents: number, sources: number[]): boolean {
    const pool = sources.map((c) => Math.abs(c)).filter((c) => c !== 0);

    // Pairs
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i];
        const b = pool[j];
        if (a + b === targetCents || a - b === targetCents || b - a === targetCents || -a - b === targetCents) {
          return true;
        }
      }
    }

    // Triples (capped at first 40)
    const tPool = pool.slice(0, 40);
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

  it('verifies 100 randomized scenarios against the independent mathematical oracle', () => {
    let seed = 42;
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let iteration = 1; iteration <= 100; iteration++) {
      const sourceCount = 2 + Math.floor(pseudoRandom() * 6); // 2 to 7 sources
      const rawCentsList: number[] = [];
      const sources: FigureSource[] = [];

      for (let s = 0; s < sourceCount; s++) {
        const amountCents = Math.floor(pseudoRandom() * 50000) + 100; // $1.00 to $500.00
        rawCentsList.push(amountCents);
        sources.push({ cents: amountCents, label: `Source ${s}` });
      }

      // Generate a candidate target: half the time pick a true derivable combo, half the time a random number
      let testTarget: number;
      if (iteration % 2 === 0) {
        // True combination
        const a = rawCentsList[0];
        const b = rawCentsList[1];
        testTarget = iteration % 4 === 0 ? a + b : a - b;
      } else {
        // Arbitrary number
        testTarget = Math.floor(pseudoRandom() * 100000) + 50;
      }

      const expectedDerivable = oracleDerivable(testTarget, rawCentsList);
      const formulaResult = findDerivedFormula(testTarget, sources);

      if (expectedDerivable) {
        expect(formulaResult).not.toBeNull();
        // Check that formula evaluates correctly to testTarget
        const expectedTargetStr = formatFigureCents(testTarget);
        expect(formulaResult).toContain(`= ${expectedTargetStr}`);
      } else {
        expect(formulaResult).toBeNull();
      }
    }
  });
});
