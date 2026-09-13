import { describe, it, expect } from 'vitest';
import { parseCsvWithProfile, aggregateTransactions, cleanMerchantName } from '../csvParser';
import { BANK_PROFILES } from '../bankProfiles';

const AMEX_CSV = `Date,Date Processed,Description,Amount
12 Sep 2026,12 Sep 2026,METROPOLIS 185          Cityville,16.27
10 Sep 2026,11 Sep 2026,APPARELSTORE.COM        800-555-0199,30.51
08 Sep 2026,09 Sep 2026,WEDDINGREGISTRY.COM     TOWN,84.80
07 Sep 2026,08 Sep 2026,UBER EATS               CITY,42.10
05 Sep 2026,06 Sep 2026,GROCERY STORE #25       CITY,23.91
05 Sep 2026,06 Sep 2026,TECH SUB *STORAGE       T.CO/HELP#,45.18
05 Sep 2026,06 Sep 2026,PAYMENT RECEIVED - THANK YOU,-364.00`;

const ROGERS_CSV = `Date,Posted Date,Reference Number,Activity Type,Activity Status,Card Number,Merchant Category Description,Merchant Name,Merchant City,Merchant State or Province,Merchant Country Code,Merchant Postal Code,Amount,Rewards,Name on Card
2026-09-09,2026-09-09,"111222333444555",TRANS,APPROVED,************1234,Computer Network/Information Services,AMZN Mktp CA*ABC123XYZ,CITY,PR,CAN,A1A 1A1,$103.28,,PERSON_A
2026-09-09,2026-09-09,"111222333444556",TRANS,APPROVED,************1234,Miscellaneous General Merchandise,Amazon.ca*DEF456XYZ,CITY,PR,CAN,A1A 1A1,$35.57,,PERSON_A`;

const PC_CSV = `"Description","Type","Card Holder Name","Date","Time","Amount"
"LOCAL GROCERY #3049","PURCHASE","PERSON_A","09/08/2026","05:12 PM","-7.86"
"GAS STATION","PURCHASE","PERSON_B","09/08/2026","12:26 AM","-5.65"
"GAS STATION","PURCHASE","PERSON_B","09/07/2026","04:00 AM","-73.56"
"SUPERMARKET #1018","PURCHASE","PERSON_A","09/05/2026","07:15 PM","-201.58"
"NAIL SALON","PURCHASE","PERSON_B","09/04/2026","03:01 PM","-88.14"
"Payment BANK","PAYMENT","PERSON_A","08/28/2026","04:00 AM","502.29"`;

const TANGERINE_CSV = `Transaction date,Transaction,Name,Memo,Amount
09/11/2026,CREDIT,PAYMENT - THANK YOU,PAYMENT - THANK YOU,31.49
09/11/2026,DEBIT,Amazon.ca*ABC123XYZ CITY PR,Amazon.ca*ABC123XYZ CITY PR,-31.49
08/28/2026,CREDIT,PAYMENT - THANK YOU,PAYMENT - THANK YOU,243.72`;


describe('Merchant Cleaning', () => {
  it('strips AMEX style locations', () => {
    expect(cleanMerchantName('UBER EATS               CITY')).toBe('UBER EATS');
    expect(cleanMerchantName('METROPOLIS 185          Cityville')).toBe('METROPOLIS 185');
  });

  it('strips IDs from tech companies', () => {
    expect(cleanMerchantName('Amazon.ca*DEF456XYZ')).toBe('Amazon.ca');
    expect(cleanMerchantName('AMZN Mktp CA*ABC123XYZ')).toBe('AMZN Mktp CA');
    expect(cleanMerchantName('TECH SUB *STORAGE')).toBe('TECH SUB');
  });

  it('strips POS prefixes', () => {
    expect(cleanMerchantName('TST-THE RESTAURANT')).toBe('THE RESTAURANT');
    expect(cleanMerchantName('SP BREWERY')).toBe('BREWERY');
    expect(cleanMerchantName('SQ *CAFE')).toBe('CAFE');
  });

  it('strips corporate suffixes', () => {
    expect(cleanMerchantName('COOL COMPANY INC')).toBe('COOL COMPANY');
    expect(cleanMerchantName('WEBSITE.COM')).toBe('WEBSITE');
  });
});

describe('CSV Parsing & Aggregation', () => {
  it('parses AMEX correctly', () => {
    const profile = BANK_PROFILES.find(p => p.id === 'amex')!;
    const transactions = parseCsvWithProfile(AMEX_CSV, profile);
    
    // Payment should be filtered out (6 purchases left)
    expect(transactions.length).toBe(6);
    
    // Amount should be positive
    expect(transactions[0].amount).toBe(16.27);
    
    // Date should parse
    expect(transactions[0].date.getFullYear()).toBe(2026);
    
    const { total } = aggregateTransactions(transactions);
    expect(total).toBeCloseTo(16.27 + 30.51 + 84.80 + 42.10 + 23.91 + 45.18);
  });

  it('parses Rogers correctly', () => {
    const profile = BANK_PROFILES.find(p => p.id === 'rogers')!;
    const transactions = parseCsvWithProfile(ROGERS_CSV, profile);
    
    expect(transactions.length).toBe(2);
    expect(transactions[0].amount).toBe(103.28); // $ stripped
    
    const { markdown } = aggregateTransactions(transactions);
    expect(markdown).toContain('Amazon.ca'); // 2nd row cleaned
    expect(markdown).toContain('AMZN Mktp CA'); // 1st row cleaned
    expect(markdown).toContain('Rogers Bank'); // Card name should be present
  });

  it('parses PC Financial correctly (inverted polarity)', () => {
    const profile = BANK_PROFILES.find(p => p.id === 'pc')!;
    const transactions = parseCsvWithProfile(PC_CSV, profile);
    
    // 5 purchases, 1 payment. Payment should be filtered.
    expect(transactions.length).toBe(5);
    
    // Amount should be positive now
    expect(transactions[0].amount).toBe(7.86);
    
    const agg = aggregateTransactions(transactions);
    expect(agg.markdown).toContain('GAS STATION'); 
    expect(agg.markdown).toContain('PC Financial');
  });

  it('parses Tangerine correctly (inverted polarity)', () => {
    const profile = BANK_PROFILES.find(p => p.id === 'tangerine')!;
    const transactions = parseCsvWithProfile(TANGERINE_CSV, profile);
    
    // 2 payments, 1 purchase. Payments should be filtered by default.
    expect(transactions.length).toBe(1);
    expect(transactions[0].amount).toBe(31.49);
    expect(transactions[0].merchant).toBe('Amazon.ca'); // ID and location stripped
  });

  it('includes payments when configured via options', () => {
    const profile = BANK_PROFILES.find(p => p.id === 'tangerine')!;
    const transactions = parseCsvWithProfile(TANGERINE_CSV, profile, { includePayments: true });
    
    // All 3 rows should be parsed
    expect(transactions.length).toBe(3);
    
    // First payment should be negative since it's an inflow (CREDIT in Tangerine becomes negative after polarity inversion because purchases are positive)
    expect(transactions[0].amount).toBe(-31.49); 
    
    // Purchase should be positive
    expect(transactions[1].amount).toBe(31.49);
  });
});
