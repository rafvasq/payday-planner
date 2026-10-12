import { describe, it, expect } from 'vitest';
import { categorizeAndCalculateVariance, ParsedTransaction } from '../core/csvParser';

describe('categorizeAndCalculateVariance', () => {
  it('correctly maps merchants to events using string similarity and calculates variances', () => {
    const transactions: ParsedTransaction[] = [
      { date: new Date(), merchant: 'Uber Eats', amount: -25.50, card: 'Visa' },
      { date: new Date(), merchant: 'Uber', amount: -15.00, card: 'Visa' },
      { date: new Date(), merchant: 'Loblaws', amount: -100.00, card: 'Visa' },
      { date: new Date(), merchant: 'Random Unmapped Shop', amount: -50.00, card: 'Visa' },
      { date: new Date(), merchant: 'Salary', amount: 2000.00, card: 'Chequing' }
    ];

    const events = [
      { name: 'Uber Eats', amount: -50.00 },
      { name: 'Loblaws Groceries', amount: -150.00 },
      { name: 'Income', amount: 2000.00 }
    ];

    const report = categorizeAndCalculateVariance(transactions, events);

    expect(report.totalBaseline).toBe(200.00); 
    expect(report.categories['Uber Eats'].actual).toBe(40.50); // 25.50 + 15.00
    expect(report.categories['Loblaws Groceries'].actual).toBe(100.00);
    expect(report.unmappedTransactions.length).toBe(1);
    expect(report.unmappedTransactions[0].merchant).toBe('Random Unmapped Shop');
  });
});
