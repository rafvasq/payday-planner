import Papa from 'papaparse';
import { parse, isValid, format } from 'date-fns';

export interface BankProfile {
  id: string;
  name: string;
  dateColumn: string;
  merchantColumn: string;
  amountColumn: string;
  invertPolarity: boolean; // if true, negative amounts become positive (purchases)
  dateFormat?: string; // fallback or specific format if auto-parse fails
  identifyingHeaders?: string[]; // Unique headers to auto-detect this profile
}

export const BANK_PROFILES: BankProfile[] = [
  {
    id: 'amex',
    name: 'American Express',
    dateColumn: 'Date',
    merchantColumn: 'Description',
    amountColumn: 'Amount',
    invertPolarity: false,
    dateFormat: 'dd MMM yyyy',
    identifyingHeaders: ['Date Processed', 'Description'], // AMEX specific combo
  },
  {
    id: 'rogers',
    name: 'Rogers Bank',
    dateColumn: 'Date',
    merchantColumn: 'Merchant Name',
    amountColumn: 'Amount',
    invertPolarity: false,
    dateFormat: 'yyyy-MM-dd',
    identifyingHeaders: ['Posted Date', 'Reference Number', 'Card Number'],
  },
  {
    id: 'pc',
    name: 'PC Financial',
    dateColumn: 'Date',
    merchantColumn: 'Description',
    amountColumn: 'Amount',
    invertPolarity: true,
    dateFormat: 'MM/dd/yyyy',
    identifyingHeaders: ['Card Holder Name', 'Time', 'Type'],
  },
  {
    id: 'tangerine',
    name: 'Tangerine',
    dateColumn: 'Transaction date',
    merchantColumn: 'Name',
    amountColumn: 'Amount',
    invertPolarity: true,
    dateFormat: 'MM/dd/yyyy',
    identifyingHeaders: ['Transaction date', 'Memo'],
  },
];

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

export function cleanMerchantName(rawName: string): string {
  let name = rawName.trim();

  // 1. POS Prefix Stripper
  // Must run before ID stripper so we don't accidentally split SQ *CAFE
  name = name.replace(/^(TST-|SP |SQ \*?)/i, '').trim();

  // 2. ID Stripper (Amazon/Tech strings)
  // E.g., Amazon.ca*5397P6SO2 -> Amazon.ca
  // E.g., AMZN Mktp CA*533L24KV2 -> AMZN Mktp CA
  name = name.split(/\*|#/)[0].trim();

  // 3. The "Two-Space Stripper" (AMEX style)
  // E.g., "UBER EATS               TORONTO" -> "UBER EATS"
  name = name.split(/\s{2,}/)[0].trim();

  // 4. Corporate Suffix Stripper (Optional, but helps grouping)
  name = name.replace(/(\s+INC|\s+LTD|\.COM|\s+COM)$/i, '').trim();

  return name || 'Unknown Merchant';
}

export interface ParsedTransaction {
  date: Date;
  merchant: string;
  amount: number;
  card: string;
}

export function parseCsvWithProfile(csvText: string, profile: BankProfile): ParsedTransaction[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn('CSV parsing errors:', result.errors);
  }

  const transactions: ParsedTransaction[] = [];

  for (const row of result.data as any[]) {
    // Extract raw fields
    const rawDate = row[profile.dateColumn];
    const rawMerchant = row[profile.merchantColumn];
    const rawAmount = row[profile.amountColumn];

    if (!rawDate || !rawMerchant || rawAmount === undefined) {
      continue;
    }

    // Parse Amount
    // Strip $ and ,
    const cleanAmountStr = String(rawAmount).replace(/[$,]/g, '');
    let amount = parseFloat(cleanAmountStr);
    if (isNaN(amount)) continue;

    if (profile.invertPolarity) {
      amount = -amount;
    }

    // Filter out payments (amount <= 0 after polarity adjustment)
    // Actually, sometimes people want to see refunds? Let's keep it simple: 
    // Usually we only care about positive spending outflows.
    if (amount <= 0) continue; 
    
    // PC Financial sometimes has a Type column "PAYMENT". 
    // Just relying on amount <= 0 naturally filters out payments if polarity is correct!
    // Since PC purchases are negative, inverted they become positive. Payments are positive, inverted they become negative.
    // AMEX purchases are positive. Payments are negative. So amount <= 0 filters them perfectly in both cases!

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
  
  // Filter by date if provided
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
