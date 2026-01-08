import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgetItems } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { categoryId, name, planned } = body;

  if (!categoryId || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const [item] = await db
    .insert(budgetItems)
    .values({
      categoryId: parseInt(categoryId),
      name,
      planned: planned || 0,
    })
    .returning();

  return NextResponse.json(item);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, planned } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
  }

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (planned !== undefined) updates.planned = planned;

  const [item] = await db
    .update(budgetItems)
    .set(updates)
    .where(eq(budgetItems.id, parseInt(id)))
    .returning();

  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
  }

  await db.delete(budgetItems).where(eq(budgetItems.id, parseInt(id)));

  return NextResponse.json({ success: true });
}