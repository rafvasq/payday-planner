import Papa from 'papaparse';
import { parse, isValid, format } from 'date-fns';
import { BankProfile, BANK_PROFILES } from './bankProfiles';

export type { BankProfile } from './bankProfiles';
export { BANK_PROFILES } from './bankProfiles';

export interface ParserOptions {
  includePayments?: boolean;
}

export function autoDetectProfile(headers: string[]): BankProfile | undefined {
  if (!headers || headers.length === 0) return undefined;
  
  for (const profile of BANK_PROFILES) {
    if (profile.identifyingHeaders) {
      const isMatch = profile.identifyingHeaders.every(h => headers.includes(h));
      if (isMatch) return profile;
    }
  }
  return undefined;
}

// The Rule Engine for cleaning merchant names
const CLEANING_RULES = [
  // 1. POS Prefix Stripper (Must run before ID stripper)
  { id: 'pos_prefix', apply: (s: string) => s.replace(/^(TST-|SP |SQ \*?)/i, '') },
  // 2. ID Stripper (Amazon/Tech strings e.g. Amazon.ca*12345)
  { id: 'tech_id', apply: (s: string) => s.split(/\*|#/)[0] },
  // 3. The "Two-Space Stripper" (AMEX style locations)
  { id: 'amex_space', apply: (s: string) => s.split(/\s{2,}/)[0] },
  // 4. Corporate Suffix Stripper
  { id: 'corp_suffix', apply: (s: string) => s.replace(/(\s+INC|\s+LTD|\.COM|\s+COM)$/i, '') }
];

export function cleanMerchantName(rawName: string): string {
  const cleaned = CLEANING_RULES.reduce((name, rule) => {
    return rule.apply(name).trim();
  }, rawName.trim());

  return cleaned || 'Unknown Merchant';
}

export interface ParsedTransaction {
  date: Date;
  merchant: string;
  amount: number;
  card: string;
}

export function parseCsvWithProfile(
  csvText: string, 
  profile: BankProfile, 
  options?: ParserOptions
): ParsedTransaction[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn('CSV parsing errors:', result.errors);
  }

  const transactions: ParsedTransaction[] = [];

  for (const row of result.data as any[]) {
    const rawDate = row[profile.dateColumn];
    const rawMerchant = row[profile.merchantColumn];
    const rawAmount = row[profile.amountColumn];

    if (!rawDate || !rawMerchant || rawAmount === undefined) {
      continue;
    }

    // Parse Amount (Assuming NA format for now)
    const cleanAmountStr = String(rawAmount).replace(/[$,]/g, '');
    let amount = parseFloat(cleanAmountStr);
    if (isNaN(amount)) continue;

    if (profile.invertPolarity) {
      amount = -amount;
    }

    // Business Logic: Filter out payments and refunds unless configured otherwise
    if (amount <= 0 && !options?.includePayments) {
      continue;
    }

    // Parse Date
    let date = new Date(rawDate);
    if (!isValid(date) && profile.dateFormat) {
       date = parse(rawDate, profile.dateFormat, new Date());
    }
    if (!isValid(date)) continue;

    const merchant = cleanMerchantName(String(rawMerchant));

    transactions.push({ date, merchant, amount, card: profile.name });
  }

  return transactions;
}

export function aggregateTransactions(
  transactions: ParsedTransaction[],
  startDate?: Date,
  endDate?: Date
): { markdown: string; total: number } {
  
  let filtered = transactions;
  if (startDate) {
    filtered = filtered.filter(t => t.date >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter(t => t.date <= endDate);
  }

  // Sort chronologically
  filtered.sort((a, b) => a.date.getTime() - b.date.getTime());

  let absoluteTotal = 0;
  let md = '| Date | Card | Merchant | Amount |\n|---|---|---|---|\n';
  
  for (const t of filtered) {
    absoluteTotal += t.amount;
    const dateStr = format(t.date, 'yyyy-MM-dd');
    md += `| ${dateStr} | ${t.card} | ${t.merchant} | $${t.amount.toFixed(2)} |\n`;
  }
  md += `| **TOTAL** | | | **$${absoluteTotal.toFixed(2)}** |\n`;

  return { markdown: md, total: absoluteTotal };
}
