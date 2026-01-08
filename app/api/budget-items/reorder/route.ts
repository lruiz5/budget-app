import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgetItems } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { items } = body;

  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Update each item's order
  for (const item of items) {
    await db
      .update(budgetItems)
      .set({ order: item.order })
      .where(eq(budgetItems.id, parseInt(item.id)));
  }

  return NextResponse.json({ success: true });
}