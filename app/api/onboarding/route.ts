import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { userOnboarding } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

// GET - Check onboarding status
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const record = await db.query.userOnboarding?.findFirst({
    where: eq(userOnboarding.userId, userId),
  });

  if (!record) {
    return NextResponse.json({ completed: false, currentStep: 1 });
  }

  return NextResponse.json({
    completed: !!record.completedAt || !!record.skippedAt,
    currentStep: record.currentStep,
    completedAt: record.completedAt,
    skippedAt: record.skippedAt,
  });
}

// POST - Initialize onboarding record
export async function POST() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const existing = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId));
  if (existing.length > 0) {
    return NextResponse.json(existing[0]);
  }

  const [record] = await db.insert(userOnboarding).values({ userId }).returning();
  return NextResponse.json(record);
}

// PUT - Update current step
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const { step } = await request.json();

  const existing = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId));
  if (existing.length === 0) {
    const [record] = await db.insert(userOnboarding).values({ userId, currentStep: step }).returning();
    return NextResponse.json(record);
  }

  await db.update(userOnboarding)
    .set({ currentStep: step })
    .where(eq(userOnboarding.userId, userId));

  return NextResponse.json({ success: true });
}

// PATCH - Complete or skip onboarding
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const { action } = await request.json();

  const updates: Record<string, unknown> = {};
  if (action === 'complete') {
    updates.completedAt = new Date();
    updates.currentStep = 6;
  } else if (action === 'skip') {
    updates.skippedAt = new Date();
  }

  const existing = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId));
  if (existing.length === 0) {
    await db.insert(userOnboarding).values({ userId, ...updates });
  } else {
    await db.update(userOnboarding).set(updates).where(eq(userOnboarding.userId, userId));
  }

  return NextResponse.json({ success: true });
}
