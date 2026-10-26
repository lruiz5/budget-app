"use client";

import { useState, useEffect } from "react";
import { Check, ChevronDown, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

interface CreditCardCharge {
  id: number;
  date: string;
  amount: number;
  merchant: string | null;
  status: string | null;
}

interface CreditCardPayment extends CreditCardCharge {
  paired: boolean;
}

interface CreditCardSummary {
  accountId: number;
  accountName: string;
  institutionName: string;
  opening: number;
  charges: number;
  refunds: number;
  payments: number;
  outstanding: number;
  pendingCharges: number;
  liveOwed: number | null;
  chargeList: CreditCardCharge[];
  paymentList: CreditCardPayment[];
}

interface CreditCardPanelProps {
  month: number; // 0-indexed
  year: number;
  refreshKey?: string | number; // bump to refetch (sync finished, payment marked, ...)
}

const formatShortDate = (dateString: string) => {
  // Parse as local date to avoid timezone shift (YYYY-MM-DD format)
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Row label that expands the transactions behind its total
function ListToggle({ label, count, isExpanded, onToggle }: {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 text-text-secondary text-base hover:text-text-primary transition-colors"
      disabled={count === 0}
    >
      {label}
      {count > 0 && (
        <ChevronDown size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      )}
    </button>
  );
}

// Per-card payoff for the budget month: purchases are budgeted like any
// spending, payoffs are transfers — the goal is $0 left to pay by month end
export default function CreditCardPanel({ month, year, refreshKey }: CreditCardPanelProps) {
  const [cards, setCards] = useState<CreditCardSummary[]>([]);
  // "<accountId>:charges" | "<accountId>:payments"
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key));

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bank/credit-summary?month=${month}&year=${year}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) setCards(data); })
      .catch((error) => console.error("Error fetching credit card summary:", error));
    return () => { cancelled = true; };
  }, [month, year, refreshKey]);

  if (cards.length === 0) return null;

  // The live balance is "now", so it only checks the current month
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  return (
    <div>
      <h3 className="text-xl font-semibold text-text-secondary mb-5">
        Credit Card
      </h3>
      <div className="space-y-8">
        {cards.map((card) => {
          const paidOff = card.outstanding <= 0.005;
          // Bank balances exclude pending charges
          const postedOutstanding = card.outstanding - card.pendingCharges;
          const matchesBank = card.liveOwed != null && Math.abs(postedOutstanding - card.liveOwed) < 0.01;
          const chargesKey = `${card.accountId}:charges`;
          const paymentsKey = `${card.accountId}:payments`;

          return (
            <div key={card.accountId}>
              <p className="flex items-center gap-2 text-sm text-text-tertiary mb-2">
                <CreditCard size={14} />
                {card.accountName}
              </p>
              <div className="space-y-1">
                {Math.abs(card.opening) > 0.005 && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-text-secondary text-base">Opening balance:</span>
                    <span className="text-xl font-semibold text-text-primary">
                      ${formatCurrency(card.opening)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1">
                  <ListToggle
                    label="Charged:"
                    count={card.chargeList.length}
                    isExpanded={expanded === chargesKey}
                    onToggle={() => toggle(chargesKey)}
                  />
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(card.charges)}
                  </span>
                </div>
                {expanded === chargesKey && (
                  <div className="pl-3 pb-1 space-y-1">
                    {card.chargeList.map((charge) => (
                      <div key={charge.id} className="flex justify-between items-center gap-3 text-sm text-text-secondary">
                        <span className="truncate">
                          {formatShortDate(charge.date)} · {charge.merchant || "Card purchase"}
                          {charge.status === "pending" && (
                            <span className="text-text-tertiary"> · pending</span>
                          )}
                        </span>
                        <span className="shrink-0">${formatCurrency(charge.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {card.refunds > 0 && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-text-secondary text-base">Refunds:</span>
                    <span className="text-xl font-semibold text-text-primary">
                      -${formatCurrency(card.refunds)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1">
                  <ListToggle
                    label="Paid:"
                    count={card.paymentList.length}
                    isExpanded={expanded === paymentsKey}
                    onToggle={() => toggle(paymentsKey)}
                  />
                  <span className="text-xl font-semibold text-text-primary">
                    -${formatCurrency(card.payments)}
                  </span>
                </div>
                {expanded === paymentsKey && (
                  <div className="pl-3 pb-1 space-y-1">
                    {card.paymentList.map((payment) => (
                      <div key={payment.id} className="flex justify-between items-center text-sm text-text-secondary">
                        <span>
                          {formatShortDate(payment.date)}
                          {!payment.paired && (
                            <span className="text-text-tertiary" title="No matching checking payback found">
                              {" "}· no checking match
                            </span>
                          )}
                        </span>
                        <span>${formatCurrency(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t-2 border-border-strong pt-4 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-text-primary text-base">
                      {paidOff ? "Paid off" : "Left to pay off:"}
                    </span>
                    <span
                      className={`flex items-center gap-2 text-3xl font-bold ${
                        paidOff ? "text-success" : "text-text-primary"
                      }`}
                    >
                      {paidOff && <Check size={24} />}
                      {card.outstanding < -0.005
                        ? `$${formatCurrency(-card.outstanding)} credit`
                        : `$${formatCurrency(Math.max(card.outstanding, 0))}`}
                    </span>
                  </div>
                  {(card.pendingCharges > 0 || (isCurrentMonth && card.liveOwed != null)) && (
                    <p className="text-xs text-text-tertiary mt-2 text-right">
                      {card.pendingCharges > 0 && `Includes $${formatCurrency(card.pendingCharges)} pending`}
                      {card.pendingCharges > 0 && isCurrentMonth && card.liveOwed != null && " · "}
                      {isCurrentMonth && card.liveOwed != null && (
                        matchesBank ? (
                          <span className="text-success">Matches bank balance</span>
                        ) : (
                          <span title="Bank data can lag a day or more">
                            Bank shows ${formatCurrency(card.liveOwed)} owed
                          </span>
                        )
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
