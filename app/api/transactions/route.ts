import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { budgetItemId, date, description, amount } = body;

  if (!budgetItemId || !date || !description || amount === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const [transaction] = await db
    .insert(transactions)
    .values({
      budgetItemId: parseInt(budgetItemId),
      date,
      description,
      amount,
    })
    .returning();

  return NextResponse.json(transaction);
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  }

  await db.delete(transactions).where(eq(transactions.id, parseInt(id)));

  return NextResponse.json({ success: true });
}