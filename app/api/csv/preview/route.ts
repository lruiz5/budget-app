import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { parseCsvText, detectColumnMapping, detectDateFormat } from '@/lib/csvParser';
import { CsvPreviewResponse } from '@/types/csv';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file content
    const csvText = await file.text();

    if (!csvText.trim()) {
      return NextResponse.json(
        { error: 'File is empty' },
        { status: 400 }
      );
    }

    // Parse CSV
    const { headers, rows } = parseCsvText(csvText);

    if (headers.length === 0) {
      return NextResponse.json(
        { error: 'No columns detected in CSV' },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found in CSV' },
        { status: 400 }
      );
    }

    // Auto-detect column mapping
    const detectedMapping = detectColumnMapping(headers);

    // Try to detect date format from sample data
    if (detectedMapping.dateColumn) {
      const dateSamples = rows.slice(0, 10).map(r => r[detectedMapping.dateColumn!]);
      const dateFormat = detectDateFormat(dateSamples);
      if (dateFormat) {
        detectedMapping.dateFormat = dateFormat;
      }
    }

    // Get sample rows (first 5)
    const sampleRows = rows.slice(0, 5);

    const response: CsvPreviewResponse = {
      headers,
      sampleRows,
      detectedMapping,
      totalRows: rows.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('CSV preview error:', error);
    return NextResponse.json(
      { error: 'Failed to parse CSV file' },
      { status: 500 }
    );
  }
}
