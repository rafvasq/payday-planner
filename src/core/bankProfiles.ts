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
