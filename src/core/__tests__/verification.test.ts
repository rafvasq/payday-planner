import { describe, it, expect } from 'vitest';
import { getKnownCents, findUnmatchedFigures } from '../verification';

describe('Verification tests', () => {
  it('handles optional cents, trailing punctuation, negative amounts, user-message exemption, and tool-output figures', () => {
    // 1. Tool outputs and user messages can contain negative amounts and trailing punctuation
    const knownCents = getKnownCents([], [], ['User says I have -$5,000.', 'Tool returned $-300,500.50!']);
    
    // -5000 dollars -> 500000 cents
    expect(knownCents.has(500000)).toBe(true);
    // -300500.50 dollars -> 30050050 cents
    expect(knownCents.has(30050050)).toBe(true);

    // 2. Trailing punctuation matching in assistant messages
    // The assistant might write: The balance is -$5,000. And a new one is $100, which is good.
    const unmatched = findUnmatchedFigures('The balance is -$5,000. And a new one is $100, which is good.', knownCents);
    expect(unmatched).toEqual(['$100']);
  });
});
