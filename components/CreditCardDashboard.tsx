'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaCreditCard, FaChevronDown, FaChevronUp, FaPen, FaCheck, FaTimes } from 'react-icons/fa';
import { api } from '@/lib/api-client';
import { CreditCardSummary } from '@/types/budget';
import { formatCurrency } from '@/lib/formatCurrency';
import { parseLocalDate } from '@/lib/dateHelpers';
import { useToast } from '@/contexts/ToastContext';

export default function CreditCardDashboard() {
  const toast = useToast();
  const [cards, setCards] = useState<CreditCardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ creditLimit: '', minimumPayment: '', paymentDueDate: '' });

  const fetchCards = useCallback(async () => {
    try {
      const data = await api.creditCard.getSummary();
      setCards(data);
    } catch (error) {
      console.error('Error fetching credit cards:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const togglePaymentHistory = (accountId: string) => {
    setExpandedPayments(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const startEditing = (card: CreditCardSummary) => {
    setEditingCard(card.accountId);
    setEditValues({
      creditLimit: card.creditLimit > 0 ? card.creditLimit.toString() : '',
      minimumPayment: card.minimumPayment > 0 ? card.minimumPayment.toString() : '',
      paymentDueDate: card.paymentDueDate || '',
    });
  };

  const cancelEditing = () => {
    setEditingCard(null);
  };

  const saveEditing = async (accountId: string) => {
    try {
      await api.creditCard.update(accountId, {
        creditLimit: editValues.creditLimit ? parseFloat(editValues.creditLimit) : undefined,
        minimumPayment: editValues.minimumPayment ? parseFloat(editValues.minimumPayment) : undefined,
        paymentDueDate: editValues.paymentDueDate || undefined,
      });
      setEditingCard(null);
      await fetchCards();
      toast.success('Credit card updated');
    } catch {
      toast.error('Failed to update credit card');
    }
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization < 30) return 'bg-success';
    if (utilization < 70) return 'bg-yellow-500';
    return 'bg-danger';
  };

  const getUtilizationTextColor = (utilization: number) => {
    if (utilization < 30) return 'text-success';
    if (utilization < 70) return 'text-yellow-600';
    return 'text-danger';
  };

  const getDaysUntilDue = (dueDate: string | null): number | null => {
    if (!dueDate) return null;
    const due = parseLocalDate(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = due.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return null;
  }

  if (cards.length === 0) {
    return null; // Don't show section if no credit cards
  }

  return (
    <div className="bg-surface rounded-lg shadow p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <FaCreditCard className="text-primary text-lg" />
        <h2 className="text-xl font-semibold text-text-primary">Credit Cards</h2>
      </div>

      <div className="space-y-6">
        {cards.map((card) => {
          const daysUntilDue = getDaysUntilDue(card.paymentDueDate);
          const isEditing = editingCard === card.accountId;
          const isExpanded = expandedPayments.has(card.accountId);

          return (
            <div key={card.accountId} className="border border-border rounded-lg p-4">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-light rounded-full flex items-center justify-center">
                    <FaCreditCard className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">
                      {card.institutionName} - {card.accountName}
                    </h3>
                    <p className="text-sm text-text-secondary">
                      {card.lastFour ? `....${card.lastFour}` : 'Credit Card'}
                    </p>
                  </div>
                </div>
                {!isEditing ? (
                  <button
                    onClick={() => startEditing(card)}
                    className="text-text-tertiary hover:text-text-primary p-1"
                    title="Edit card details"
                  >
                    <FaPen className="text-xs" />
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => saveEditing(card.accountId)}
                      className="text-success hover:text-success p-1"
                      title="Save"
                    >
                      <FaCheck className="text-xs" />
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="text-danger hover:text-danger p-1"
                      title="Cancel"
                    >
                      <FaTimes className="text-xs" />
                    </button>
                  </div>
                )}
              </div>

              {/* Utilization Bar */}
              {card.creditLimit > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">Utilization</span>
                    <span className={getUtilizationTextColor(card.utilization)}>
                      {card.utilization.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-surface-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getUtilizationColor(card.utilization)}`}
                      style={{ width: `${Math.min(card.utilization, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Balance Info */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-xs text-text-tertiary">Current Balance</p>
                  <p className="font-semibold text-text-primary">{formatCurrency(card.currentBalance)}</p>
                </div>
                {isEditing ? (
                  <div>
                    <p className="text-xs text-text-tertiary">Credit Limit</p>
                    <input
                      type="number"
                      value={editValues.creditLimit}
                      onChange={(e) => setEditValues(v => ({ ...v, creditLimit: e.target.value }))}
                      className="w-full px-2 py-1 text-sm border border-border rounded bg-surface"
                      placeholder="Enter limit..."
                    />
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-text-tertiary">Credit Limit</p>
                    <p className="font-semibold text-text-primary">
                      {card.creditLimit > 0 ? formatCurrency(card.creditLimit) : '-'}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-text-tertiary">Available Credit</p>
                  <p className="font-semibold text-success">
                    {card.availableBalance > 0 ? formatCurrency(card.availableBalance) : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">This Month&apos;s Charges</p>
                  <p className="font-semibold text-text-primary">{formatCurrency(card.monthlyCharges)}</p>
                </div>
              </div>

              {/* Payment Info */}
              <div className="flex items-center gap-4 mb-3 text-sm">
                {isEditing ? (
                  <>
                    <div className="flex-1">
                      <p className="text-xs text-text-tertiary mb-1">Min. Payment</p>
                      <input
                        type="number"
                        value={editValues.minimumPayment}
                        onChange={(e) => setEditValues(v => ({ ...v, minimumPayment: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-border rounded bg-surface"
                        placeholder="Min payment..."
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-text-tertiary mb-1">Due Date</p>
                      <input
                        type="date"
                        value={editValues.paymentDueDate}
                        onChange={(e) => setEditValues(v => ({ ...v, paymentDueDate: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-border rounded bg-surface"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {card.minimumPayment > 0 && (
                      <div>
                        <span className="text-text-tertiary">Min. Payment: </span>
                        <span className="text-text-primary font-medium">{formatCurrency(card.minimumPayment)}</span>
                      </div>
                    )}
                    {card.paymentDueDate && daysUntilDue !== null && (
                      <div>
                        <span className="text-text-tertiary">Due: </span>
                        <span className={`font-medium ${daysUntilDue <= 7 ? 'text-danger' : daysUntilDue <= 14 ? 'text-yellow-600' : 'text-text-primary'}`}>
                          {daysUntilDue === 0 ? 'Today' :
                           daysUntilDue === 1 ? 'Tomorrow' :
                           daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} days overdue` :
                           `in ${daysUntilDue} days`}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Payment History Toggle */}
              {card.recentPayments.length > 0 && (
                <div>
                  <button
                    onClick={() => togglePaymentHistory(card.accountId)}
                    className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
                  >
                    {isExpanded ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                    Payment History ({card.recentPayments.length})
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-1">
                      {card.recentPayments.map((payment) => (
                        <div key={payment.id} className="flex justify-between text-sm py-1 border-t border-border">
                          <div className="text-text-secondary">
                            {payment.date} - {payment.description}
                          </div>
                          <div className="text-success font-medium">
                            {formatCurrency(payment.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
