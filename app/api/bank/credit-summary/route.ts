import { NextRequest, NextResponse } from 'next/server';
import { getCreditSummaries } from '@/lib/creditCards';
import { requireAuth, isAuthError } from '@/lib/auth';

// GET - Per-card payoff summary for a budget month (month is 0-indexed):
// opening balance, charges, refunds, payments and what's left to pay off
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get('month') ?? '');
    const year = parseInt(searchParams.get('year') ?? '');
    if (Number.isNaN(month) || Number.isNaN(year) || month < 0 || month > 11) {
      return NextResponse.json({ error: 'month (0-11) and year are required' }, { status: 400 });
    }

    const summaries = await getCreditSummaries(userId, month, year);
    return NextResponse.json(summaries);
  } catch (error) {
    console.error('Error fetching credit card summary:', error);
    return NextResponse.json({ error: 'Failed to fetch credit card summary' }, { status: 500 });
  }
}
