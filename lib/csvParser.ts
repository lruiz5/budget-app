import crypto from 'crypto';
import {
  CsvColumnMapping,
  CsvParseResult,
  CsvParseError,
  ParsedCsvRow,
  DateFormat,
  DATE_FORMAT_PATTERNS,
  COLUMN_PATTERNS,
  DEFAULT_CSV_MAPPING,
} from '@/types/csv';

/**
 * Parse CSV text into rows of key-value objects
 */
export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Detect delimiter (comma, semicolon, or tab)
  const delimiter = detectDelimiter(lines[0]);

  // Parse header row
  const headers = parseCsvLine(lines[0], delimiter).map(h => h.trim());

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

/**
 * Detect CSV delimiter from first line
 */
function detectDelimiter(line: string): string {
  const delimiters = [',', ';', '\t'];
  let bestDelimiter = ',';
  let maxCount = 0;

  for (const d of delimiters) {
    // Count occurrences outside of quotes
    let count = 0;
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === d && !inQuotes) count++;
    }
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = d;
    }
  }

  return bestDelimiter;
}

/**
 * Auto-detect column mapping from headers
 */
export function detectColumnMapping(headers: string[]): Partial<CsvColumnMapping> {
  const mapping: Partial<CsvColumnMapping> = { ...DEFAULT_CSV_MAPPING };
  const lowerHeaders = headers.map(h => h.toLowerCase());

  // Find date column
  for (const pattern of COLUMN_PATTERNS.date) {
    const idx = lowerHeaders.findIndex(h => h.includes(pattern));
    if (idx !== -1) {
      mapping.dateColumn = headers[idx];
      break;
    }
  }

  // Find description column
  for (const pattern of COLUMN_PATTERNS.description) {
    const idx = lowerHeaders.findIndex(h => h.includes(pattern));
    if (idx !== -1) {
      mapping.descriptionColumn = headers[idx];
      break;
    }
  }

  // Check for split amount columns (debit/credit)
  let hasDebit = false;
  let hasCredit = false;

  for (const pattern of COLUMN_PATTERNS.debit) {
    const idx = lowerHeaders.findIndex(h => h.includes(pattern));
    if (idx !== -1) {
      mapping.debitColumn = headers[idx];
      hasDebit = true;
      break;
    }
  }

  for (const pattern of COLUMN_PATTERNS.credit) {
    const idx = lowerHeaders.findIndex(h => h.includes(pattern));
    if (idx !== -1) {
      mapping.creditColumn = headers[idx];
      hasCredit = true;
      break;
    }
  }

  if (hasDebit && hasCredit) {
    mapping.amountMode = 'split';
  } else {
    // Find single amount column
    mapping.amountMode = 'single';
    for (const pattern of COLUMN_PATTERNS.amount) {
      const idx = lowerHeaders.findIndex(h => h.includes(pattern));
      if (idx !== -1) {
        mapping.amountColumn = headers[idx];
        break;
      }
    }
  }

  // Find merchant column (optional)
  for (const pattern of COLUMN_PATTERNS.merchant) {
    const idx = lowerHeaders.findIndex(h => h.includes(pattern));
    if (idx !== -1 && headers[idx] !== mapping.descriptionColumn) {
      mapping.merchantColumn = headers[idx];
      break;
    }
  }

  // Find status column (optional)
  for (const pattern of COLUMN_PATTERNS.status) {
    const idx = lowerHeaders.findIndex(h => h.includes(pattern));
    if (idx !== -1) {
      mapping.statusColumn = headers[idx];
      break;
    }
  }

  return mapping;
}

/**
 * Detect date format from sample values
 */
export function detectDateFormat(samples: string[]): DateFormat | null {
  const validSamples = samples.filter(s => s && s.trim());
  if (validSamples.length === 0) return null;

  // Try each format pattern
  for (const { format, regex } of DATE_FORMAT_PATTERNS) {
    if (validSamples.every(s => regex.test(s.trim()))) {
      // For ambiguous formats (MM/DD vs DD/MM), try to disambiguate
      if (format === 'MM/DD/YYYY' || format === 'DD/MM/YYYY') {
        return disambiguateDateFormat(validSamples);
      }
      return format;
    }
  }

  // Try flexible format matching
  if (validSamples.every(s => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s.trim()))) {
    return disambiguateDateFormat(validSamples);
  }

  return null;
}

/**
 * Try to determine if dates are MM/DD or DD/MM format
 */
function disambiguateDateFormat(samples: string[]): DateFormat {
  for (const sample of samples) {
    const parts = sample.split('/');
    if (parts.length >= 2) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);

      // If first part > 12, it must be day (DD/MM)
      if (first > 12) return 'DD/MM/YYYY';
      // If second part > 12, it must be day (MM/DD)
      if (second > 12) return 'MM/DD/YYYY';
    }
  }

  // Default to MM/DD/YYYY (US format) if ambiguous
  return 'MM/DD/YYYY';
}

/**
 * Parse a date string according to the specified format
 */
export function parseDate(dateStr: string, format: DateFormat): string | null {
  const cleaned = dateStr.trim();
  if (!cleaned) return null;

  let day: number, month: number, year: number;

  try {
    switch (format) {
      case 'YYYY-MM-DD': {
        const parts = cleaned.split('-');
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
        break;
      }
      case 'MM/DD/YYYY':
      case 'M/D/YYYY': {
        const parts = cleaned.split('/');
        month = parseInt(parts[0], 10);
        day = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
        break;
      }
      case 'DD/MM/YYYY':
      case 'D/M/YYYY': {
        const parts = cleaned.split('/');
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
        break;
      }
      case 'MM-DD-YYYY': {
        const parts = cleaned.split('-');
        month = parseInt(parts[0], 10);
        day = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
        break;
      }
      case 'DD-MM-YYYY': {
        const parts = cleaned.split('-');
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
        break;
      }
      default:
        return null;
    }

    // Validate date
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (year < 1900 || year > 2100) return null;

    // Return normalized YYYY-MM-DD format
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

/**
 * Parse an amount string, handling various formats
 */
export function parseAmount(
  value: string,
  options: {
    negativeInParentheses: boolean;
    thousandSeparator: string;
    decimalSeparator: string;
  }
): number | null {
  if (!value || value.trim() === '') return null;

  let cleaned = value.trim();

  // Handle parentheses for negative
  let isNegative = false;
  if (options.negativeInParentheses && /^\(.*\)$/.test(cleaned)) {
    cleaned = cleaned.slice(1, -1);
    isNegative = true;
  }

  // Remove currency symbols
  cleaned = cleaned.replace(/[$€£¥₹]/g, '');

  // Handle negative sign
  if (cleaned.startsWith('-')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  }

  // Auto-detect separators if needed
  let thousandSep = options.thousandSeparator;
  let decimalSep = options.decimalSeparator;

  if (thousandSep === 'auto' || decimalSep === 'auto') {
    const detected = detectAmountSeparators(cleaned);
    if (thousandSep === 'auto') thousandSep = detected.thousand;
    if (decimalSep === 'auto') decimalSep = detected.decimal;
  }

  // Remove thousand separator
  if (thousandSep) {
    cleaned = cleaned.split(thousandSep).join('');
  }

  // Replace decimal separator with period
  if (decimalSep && decimalSep !== '.') {
    cleaned = cleaned.replace(decimalSep, '.');
  }

  // Parse the number
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  return isNegative ? -num : num;
}

/**
 * Auto-detect thousand and decimal separators
 */
function detectAmountSeparators(value: string): { thousand: string; decimal: string } {
  // Count occurrences of . and ,
  const dotCount = (value.match(/\./g) || []).length;
  const commaCount = (value.match(/,/g) || []).length;

  // If only one separator type
  if (dotCount === 0 && commaCount === 0) {
    return { thousand: '', decimal: '.' };
  }
  if (dotCount === 1 && commaCount === 0) {
    return { thousand: '', decimal: '.' };
  }
  if (dotCount === 0 && commaCount === 1) {
    // Could be either - check position
    const lastComma = value.lastIndexOf(',');
    const afterComma = value.slice(lastComma + 1);
    // If 2 digits after comma, likely decimal separator
    if (afterComma.length === 2 && /^\d+$/.test(afterComma)) {
      return { thousand: '', decimal: ',' };
    }
    return { thousand: ',', decimal: '.' };
  }

  // Multiple separators
  if (dotCount > 1) {
    // Multiple dots = thousand separator
    return { thousand: '.', decimal: ',' };
  }
  if (commaCount > 1) {
    // Multiple commas = thousand separator
    return { thousand: ',', decimal: '.' };
  }

  // One of each - last one is decimal
  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');

  if (lastDot > lastComma) {
    return { thousand: ',', decimal: '.' };
  } else {
    return { thousand: '.', decimal: ',' };
  }
}

/**
 * Compute a hash for deduplication
 */
export function computeTransactionHash(
  date: string,
  amount: number,
  description: string
): string {
  // Normalize: date already YYYY-MM-DD, amount absolute with 2 decimals, description lowercase trimmed
  const normalized = `${date}|${Math.abs(amount).toFixed(2)}|${description.toLowerCase().trim().slice(0, 100)}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/**
 * Parse CSV content using the specified column mapping
 */
export function parseCsvWithMapping(
  csvText: string,
  mapping: CsvColumnMapping
): CsvParseResult {
  const { headers, rows } = parseCsvText(csvText);
  const transactions: ParsedCsvRow[] = [];
  const errors: CsvParseError[] = [];

  // Skip header rows as configured
  const dataRows = rows.slice(mapping.skipHeaderRows - 1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + mapping.skipHeaderRows + 1; // 1-indexed, accounting for skipped headers

    // Parse date
    const rawDate = row[mapping.dateColumn];
    const date = parseDate(rawDate, mapping.dateFormat);
    if (!date) {
      errors.push({
        row: rowNumber,
        column: mapping.dateColumn,
        message: `Invalid date format: expected ${mapping.dateFormat}`,
        rawValue: rawDate,
      });
      continue;
    }

    // Parse description (optional - fallback to merchant or generic description)
    let description = '';
    if (mapping.descriptionColumn) {
      description = row[mapping.descriptionColumn]?.trim() || '';
    }
    // Fallback to merchant if no description
    if (!description && mapping.merchantColumn) {
      description = row[mapping.merchantColumn]?.trim() || '';
    }
    // Final fallback to a generic description with date
    if (!description) {
      description = `Transaction on ${date}`;
    }

    // Parse amount
    let amount: number | null = null;
    let type: 'income' | 'expense' = 'expense';

    const amountOptions = {
      negativeInParentheses: mapping.negativeInParentheses,
      thousandSeparator: mapping.thousandSeparator === 'auto' ? '' : mapping.thousandSeparator,
      decimalSeparator: mapping.decimalSeparator === 'auto' ? '.' : mapping.decimalSeparator,
    };

    if (mapping.amountMode === 'single' && mapping.amountColumn) {
      const rawAmount = row[mapping.amountColumn];
      amount = parseAmount(rawAmount, amountOptions);

      if (amount === null) {
        errors.push({
          row: rowNumber,
          column: mapping.amountColumn,
          message: 'Invalid amount format',
          rawValue: rawAmount,
        });
        continue;
      }

      // Negative = expense, positive = income
      type = amount < 0 ? 'expense' : 'income';
      amount = Math.abs(amount);
    } else if (mapping.amountMode === 'split' && mapping.debitColumn && mapping.creditColumn) {
      const rawDebit = row[mapping.debitColumn];
      const rawCredit = row[mapping.creditColumn];

      const debit = parseAmount(rawDebit, amountOptions);
      const credit = parseAmount(rawCredit, amountOptions);

      if (debit !== null && debit !== 0) {
        amount = Math.abs(debit);
        type = 'expense';
      } else if (credit !== null && credit !== 0) {
        amount = Math.abs(credit);
        type = 'income';
      } else {
        errors.push({
          row: rowNumber,
          message: 'No valid amount found in debit or credit columns',
          rawValue: `debit: ${rawDebit}, credit: ${rawCredit}`,
        });
        continue;
      }
    } else {
      errors.push({
        row: rowNumber,
        message: 'Amount column configuration is invalid',
      });
      continue;
    }

    // Skip zero amounts
    if (amount === 0) {
      continue;
    }

    // Parse optional merchant
    const merchant = mapping.merchantColumn ? row[mapping.merchantColumn]?.trim() : undefined;

    // Parse optional status
    let status: 'posted' | 'pending' | undefined = undefined;
    if (mapping.statusColumn) {
      const rawStatus = row[mapping.statusColumn]?.trim().toLowerCase();
      if (rawStatus) {
        // Map common status values to posted/pending
        if (['posted', 'cleared', 'complete', 'completed', 'settled'].includes(rawStatus)) {
          status = 'posted';
        } else if (['pending', 'processing', 'hold', 'authorization', 'authorized'].includes(rawStatus)) {
          status = 'pending';
        }
        // If status doesn't match known values, leave as undefined (will default to 'posted' on import)
      }
    }

    transactions.push({
      date,
      description,
      amount,
      type,
      merchant,
      status,
      rawRow: row,
      rowNumber,
    });
  }

  return {
    transactions,
    errors,
    headers,
    totalRows: rows.length,
  };
}
