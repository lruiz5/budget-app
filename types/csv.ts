// CSV Import Types

export type DateFormat =
  | 'YYYY-MM-DD'
  | 'MM/DD/YYYY'
  | 'DD/MM/YYYY'
  | 'MM-DD-YYYY'
  | 'DD-MM-YYYY'
  | 'M/D/YYYY'
  | 'D/M/YYYY';

export type AmountMode = 'single' | 'split';

export type Separator = ',' | '.' | '' | 'auto';

export interface CsvColumnMapping {
  version: 1;
  // Required columns
  dateColumn: string;
  dateFormat: DateFormat;

  // Amount handling
  amountMode: AmountMode;
  amountColumn?: string;           // If 'single': negative = expense
  debitColumn?: string;            // If 'split': expense amounts
  creditColumn?: string;           // If 'split': income amounts

  // Optional columns
  descriptionColumn?: string;      // Optional - uses merchant or raw row if missing
  merchantColumn?: string;
  statusColumn?: string;           // Maps to transaction status (posted/pending)

  // Parsing options
  skipHeaderRows: number;          // Default: 1
  negativeInParentheses: boolean;  // Handle ($100.00) format
  thousandSeparator: Separator;
  decimalSeparator: '.' | ',' | 'auto';
}

export interface ParsedCsvRow {
  date: string;           // YYYY-MM-DD format
  description: string;
  amount: number;
  type: 'income' | 'expense';
  merchant?: string;
  status?: 'posted' | 'pending';   // Transaction status
  rawRow: Record<string, string>;  // Original CSV row for debugging
  rowNumber: number;               // 1-indexed row number
}

export interface CsvParseError {
  row: number;            // 1-indexed row number
  column?: string;        // Which column had the issue
  message: string;        // Human-readable error
  rawValue?: string;      // The problematic value
}

export interface CsvParseResult {
  transactions: ParsedCsvRow[];
  errors: CsvParseError[];
  headers: string[];
  totalRows: number;
}

export interface CsvPreviewResponse {
  headers: string[];
  sampleRows: Record<string, string>[];
  detectedMapping: Partial<CsvColumnMapping> | null;
  totalRows: number;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;        // Duplicates
  errors: CsvParseError[];
}

export interface CsvAccount {
  id: string;
  userId: string;
  accountSource: 'csv';
  institutionName: string;
  accountName: string;
  accountType: string;
  accountSubtype: string;
  status: 'open' | 'closed';
  lastSyncedAt: string | null;
  csvColumnMapping: CsvColumnMapping | null;
  createdAt: string;
}

// Default column mapping for new accounts
export const DEFAULT_CSV_MAPPING: Partial<CsvColumnMapping> = {
  version: 1,
  skipHeaderRows: 1,
  negativeInParentheses: false,
  thousandSeparator: 'auto',
  decimalSeparator: 'auto',
  amountMode: 'single',
};

// Common date format patterns for auto-detection
export const DATE_FORMAT_PATTERNS: { format: DateFormat; regex: RegExp; example: string }[] = [
  { format: 'YYYY-MM-DD', regex: /^\d{4}-\d{2}-\d{2}$/, example: '2024-01-15' },
  { format: 'MM/DD/YYYY', regex: /^\d{2}\/\d{2}\/\d{4}$/, example: '01/15/2024' },
  { format: 'DD/MM/YYYY', regex: /^\d{2}\/\d{2}\/\d{4}$/, example: '15/01/2024' },
  { format: 'MM-DD-YYYY', regex: /^\d{2}-\d{2}-\d{4}$/, example: '01-15-2024' },
  { format: 'DD-MM-YYYY', regex: /^\d{2}-\d{2}-\d{4}$/, example: '15-01-2024' },
  { format: 'M/D/YYYY', regex: /^\d{1,2}\/\d{1,2}\/\d{4}$/, example: '1/5/2024' },
  { format: 'D/M/YYYY', regex: /^\d{1,2}\/\d{1,2}\/\d{4}$/, example: '5/1/2024' },
];

// Common column name patterns for auto-detection
export const COLUMN_PATTERNS = {
  date: ['date', 'transaction date', 'posted date', 'posting date', 'trans date', 'value date'],
  description: ['description', 'memo', 'narrative', 'details', 'transaction', 'particulars', 'reference'],
  amount: ['amount', 'value', 'sum', 'total'],
  debit: ['debit', 'withdrawal', 'payment', 'dr', 'money out', 'outflow'],
  credit: ['credit', 'deposit', 'cr', 'money in', 'inflow'],
  merchant: ['merchant', 'payee', 'vendor', 'name', 'counterparty'],
  status: ['status', 'state', 'transaction status', 'posted', 'pending'],
};
