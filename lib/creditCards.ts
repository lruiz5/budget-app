import { db } from '@/db';
import { linkedAccounts, transactions, splitTransactions } from '@/db/schema';
import { eq, and, isNull, inArray, gte, lt, notExists } from 'drizzle-orm';

// Credit cards are a payment method, not a budget category: purchases are
// categorized like any other spending, and payoffs are transfers (checking
// debit ↔ card credit) that never touch the budget — they only move the
// card's outstanding balance.

// Max days between the checking debit and the card-side credit of one payment
const PAIR_WINDOW_DAYS = 5;

// Card-side credits that are payoffs rather than refunds (e.g. Chase's
// "Payment Thank You-Mobile") — flagged as transfers even before the
// checking side arrives, so they never show in the New tab
const CARD_PAYMENT_PATTERN = /payment|thank you/i;

// Checking-side payees that can be a card payoff (Chase checking shows
// "Chase Credit Card") — keeps a same-amount refund from pairing with an
// unrelated checking purchase
const CHECKING_PAYOFF_PATTERN = /card|payment|autopay|epay/i;

const daysBetween = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

const sameAmount = (a: string, b: string) =>
  Math.abs(parseFloat(String(a)) - parseFloat(String(b))) < 0.005;

// Uncategorized, unpaired, non-split rows on the given accounts
function pairCandidates(accountIds: number[], type: 'income' | 'expense') {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        inArray(transactions.linkedAccountId, accountIds),
        eq(transactions.type, type),
        isNull(transactions.budgetItemId),
        isNull(transactions.transferPairId),
        isNull(transactions.deletedAt),
        notExists(
          db
            .select({ id: splitTransactions.id })
            .from(splitTransactions)
            .where(eq(splitTransactions.parentTransactionId, transactions.id))
        )
      )
    );
}

// Match each card-side credit to the checking debit that paid it (same
// amount, closest date within PAIR_WINDOW_DAYS) and flag both as one transfer.
// Bundled payoffs need nothing special — one payment is one debit + one credit
// however many purchases it covers. Categorized rows are never touched.
export async function pairCardPayments(userId: string): Promise<number> {
  const accounts = await db
    .select({ id: linkedAccounts.id, accountType: linkedAccounts.accountType })
    .from(linkedAccounts)
    .where(eq(linkedAccounts.userId, userId));
  const creditIds = accounts.filter(a => a.accountType === 'credit').map(a => a.id);
  const depositoryIds = accounts.filter(a => a.accountType !== 'credit').map(a => a.id);
  if (creditIds.length === 0) return 0;

  const cardCredits = await pairCandidates(creditIds, 'income');
  if (cardCredits.length === 0) return 0;
  const checkingDebits = depositoryIds.length > 0
    ? (await pairCandidates(depositoryIds, 'expense')).filter(d => CHECKING_PAYOFF_PATTERN.test(d.merchant || ''))
    : [];

  const used = new Set<number>();
  let paired = 0;

  for (const credit of cardCredits.sort((a, b) => a.date.localeCompare(b.date))) {
    const match = checkingDebits
      .filter(d => !used.has(d.id) && sameAmount(d.amount, credit.amount) && daysBetween(d.date, credit.date) <= PAIR_WINDOW_DAYS)
      .sort((a, b) => daysBetween(a.date, credit.date) - daysBetween(b.date, credit.date))[0];

    if (match) {
      used.add(match.id);
      await db.update(transactions).set({ isTransfer: true, transferPairId: match.id }).where(eq(transactions.id, credit.id));
      await db.update(transactions).set({ isTransfer: true, transferPairId: credit.id }).where(eq(transactions.id, match.id));
      paired++;
    } else if (!credit.isTransfer && CARD_PAYMENT_PATTERN.test(credit.merchant || '')) {
      // Payoff whose checking side hasn't synced yet (or came from elsewhere)
      await db.update(transactions).set({ isTransfer: true }).where(eq(transactions.id, credit.id));
    }
  }

  return paired;
}

export interface CreditCardCharge {
  id: number;
  date: string;
  amount: number;
  merchant: string | null;
  status: string | null;
}

export interface CreditCardPayment extends CreditCardCharge {
  paired: boolean;
}

export interface CreditCardSummary {
  accountId: number;
  accountName: string;
  institutionName: string;
  opening: number; // owed at the start of the month
  charges: number; // purchases this month
  refunds: number; // non-payment credits this month
  payments: number; // payoffs this month
  outstanding: number; // opening + charges − refunds − payments
  pendingCharges: number; // portion of charges still pending
  liveOwed: number | null; // provider balance as an amount owed (credit balances are negative)
  balanceFetchedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  chargeList: CreditCardCharge[];
  paymentList: CreditCardPayment[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Month is 0-indexed (JS). Balance is computed from the card's own
// transactions since syncStartDate (the card's $0 point), independent of how
// they're categorized — so it can be checked against the live balance.
export async function getCreditSummaries(userId: string, month: number, year: number): Promise<CreditCardSummary[]> {
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const next = month === 11 ? { y: year + 1, m: 1 } : { y: year, m: month + 2 };
  const monthEnd = `${next.y}-${String(next.m).padStart(2, '0')}-01`; // exclusive

  const cards = await db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.accountType, 'credit')));

  const summaries: CreditCardSummary[] = [];
  for (const card of cards) {
    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.linkedAccountId, card.id),
          isNull(transactions.deletedAt),
          card.syncStartDate ? gte(transactions.date, card.syncStartDate) : undefined,
          lt(transactions.date, monthEnd)
        )
      );

    let opening = 0, charges = 0, refunds = 0, payments = 0, pendingCharges = 0;
    const chargeList: CreditCardCharge[] = [];
    const paymentList: CreditCardPayment[] = [];

    for (const t of rows) {
      const amount = parseFloat(String(t.amount));
      if (t.date < monthStart) {
        opening += t.type === 'expense' ? amount : -amount;
      } else if (t.type === 'expense') {
        charges += amount;
        if (t.status === 'pending') pendingCharges += amount;
        chargeList.push({ id: t.id, date: t.date, amount, merchant: t.merchant, status: t.status });
      } else if (t.isTransfer) {
        payments += amount;
        paymentList.push({ id: t.id, date: t.date, amount, merchant: t.merchant, status: t.status, paired: t.transferPairId != null });
      } else {
        refunds += amount;
      }
    }

    summaries.push({
      accountId: card.id,
      accountName: card.accountName,
      institutionName: card.institutionName,
      opening: round2(opening),
      charges: round2(charges),
      refunds: round2(refunds),
      payments: round2(payments),
      outstanding: round2(opening + charges - refunds - payments),
      pendingCharges: round2(pendingCharges),
      liveOwed: card.balanceCached != null ? round2(-parseFloat(card.balanceCached)) : null,
      balanceFetchedAt: card.balanceFetchedAt,
      lastSuccessfulSyncAt: card.lastSuccessfulSyncAt,
      chargeList: chargeList.sort((a, b) => a.date.localeCompare(b.date)),
      paymentList: paymentList.sort((a, b) => a.date.localeCompare(b.date)),
    });
  }

  return summaries;
}
