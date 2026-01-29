'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FaPlus, FaEdit, FaTrash, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import DashboardLayout from '@/components/DashboardLayout';
import { RecurringPayment, RecurringFrequency, CategoryType } from '@/types/budget';
import { formatCurrency } from '@/lib/formatCurrency';

const frequencyLabels: Record<RecurringFrequency, string> = {
  'monthly': 'Monthly',
  'quarterly': 'Quarterly',
  'semi-annually': 'Semi-Annually',
  'annually': 'Annually',
};

const frequencyMonths: Record<RecurringFrequency, number> = {
  'monthly': 1,
  'quarterly': 3,
  'semi-annually': 6,
  'annually': 12,
};

const categoryLabels: Record<CategoryType, string> = {
  'income': 'Income',
  'giving': 'Giving',
  'household': 'Household',
  'transportation': 'Transportation',
  'food': 'Food',
  'personal': 'Personal',
  'insurance': 'Insurance',
  'saving': 'Saving',
};

export default function RecurringPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    frequency: 'monthly' as RecurringFrequency,
    nextDueDate: '',
    categoryType: '' as CategoryType | '',
  });

  const fetchPayments = useCallback(async () => {
    try {
      const response = await fetch('/api/recurring-payments');
      const data = await response.json();
      setPayments(data);
    } catch (error) {
      console.error('Error fetching recurring payments:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Track budget item ID to link after creating recurring payment
  const [pendingBudgetItemId, setPendingBudgetItemId] = useState<string | null>(null);

  // Check for pre-fill params from URL
  useEffect(() => {
    const name = searchParams.get('name');
    const amount = searchParams.get('amount');
    const category = searchParams.get('category');
    const budgetItemId = searchParams.get('budgetItemId');

    if (name || amount || category) {
      setFormData(prev => ({
        ...prev,
        name: name || '',
        amount: amount || '',
        categoryType: (category as CategoryType) || '',
      }));
      if (budgetItemId) {
        setPendingBudgetItemId(budgetItemId);
      }
      setShowAddForm(true);
      // Clear the URL params
      router.replace('/recurring', { scroll: false });
    }
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = '/api/recurring-payments';
    const method = editingPayment ? 'PUT' : 'POST';
    const body = editingPayment
      ? { id: editingPayment.id, ...formData }
      : { ...formData, budgetItemId: pendingBudgetItemId };

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        fetchPayments();
        resetForm();
        setPendingBudgetItemId(null);
      }
    } catch (error) {
      console.error('Error saving recurring payment:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this recurring payment?')) return;

    try {
      const response = await fetch(`/api/recurring-payments?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchPayments();
      }
    } catch (error) {
      console.error('Error deleting recurring payment:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      frequency: 'monthly',
      nextDueDate: '',
      categoryType: '',
    });
    setShowAddForm(false);
    setEditingPayment(null);
  };

  const startEditing = (payment: RecurringPayment) => {
    setEditingPayment(payment);
    setFormData({
      name: payment.name,
      amount: payment.amount.toString(),
      frequency: payment.frequency,
      nextDueDate: payment.nextDueDate,
      categoryType: payment.categoryType || '',
    });
    setShowAddForm(true);
  };

  // Get payments due within 60 days
  const upcomingPayments = payments.filter(p => p.daysUntilDue <= 60 && p.daysUntilDue >= 0);

  // Format date for display
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Format currency for display
  const fmtCurrency = (amount: number) => `$${formatCurrency(amount)}`;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="h-full flex items-center justify-center">
          <p className="text-text-secondary">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-surface-secondary p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-text-primary">Recurring Payments</h1>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            >
              <FaPlus size={14} />
              Add Payment
            </button>
          </div>

          {/* 60-Day Due Banner */}
          {upcomingPayments.length > 0 && (
            <div className="bg-warning-light border border-warning rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <FaExclamationTriangle className="text-warning" />
                <h2 className="font-semibold text-text-primary">Due Within 60 Days</h2>
              </div>
              <div className="space-y-2">
                {upcomingPayments.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">{payment.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-text-secondary">{fmtCurrency(payment.amount)}</span>
                      <span className={`font-medium ${payment.daysUntilDue <= 7 ? 'text-danger' : 'text-warning'}`}>
                        {payment.daysUntilDue === 0
                          ? 'Due today'
                          : payment.daysUntilDue === 1
                          ? 'Due tomorrow'
                          : `Due in ${payment.daysUntilDue} days`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add/Edit Form Modal */}
          {showAddForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-surface rounded-lg shadow-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-semibold mb-4">
                  {editingPayment ? 'Edit Recurring Payment' : 'Add Recurring Payment'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      placeholder="e.g., Netflix, Gym Membership"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={e => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Frequency
                    </label>
                    <select
                      value={formData.frequency}
                      onChange={e => setFormData({ ...formData, frequency: e.target.value as RecurringFrequency })}
                      className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      {Object.entries(frequencyLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    {formData.frequency !== 'monthly' && formData.amount && (
                      <p className="mt-1 text-sm text-text-secondary">
                        Monthly contribution: {fmtCurrency(parseFloat(formData.amount) / frequencyMonths[formData.frequency])}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Next Due Date
                    </label>
                    <input
                      type="date"
                      value={formData.nextDueDate}
                      onChange={e => setFormData({ ...formData, nextDueDate: e.target.value })}
                      className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Category
                    </label>
                    <select
                      value={formData.categoryType}
                      onChange={e => setFormData({ ...formData, categoryType: e.target.value as CategoryType | '' })}
                      className="w-full px-3 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">Select a category...</option>
                      {Object.entries(categoryLabels)
                        .filter(([key]) => key !== 'income') // Exclude income for recurring payments
                        .map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex-1 px-4 py-2 border border-border-strong text-text-secondary rounded-lg hover:bg-surface-secondary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                    >
                      {editingPayment ? 'Update' : 'Add'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Payments List */}
          {payments.length === 0 ? (
            <div className="bg-surface rounded-lg shadow p-8 text-center">
              <p className="text-text-secondary mb-4">No recurring payments yet.</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="text-primary hover:text-primary font-medium"
              >
                Add your first recurring payment
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {payments.map(payment => (
                <div key={payment.id} className="bg-surface rounded-lg shadow p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{payment.name}</h3>
                        {payment.categoryType && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-surface-secondary text-text-secondary rounded">
                            {categoryLabels[payment.categoryType]}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary">
                        {frequencyLabels[payment.frequency]} • Due {formatDate(payment.nextDueDate)}
                        {payment.daysUntilDue <= 7 && payment.daysUntilDue >= 0 && (
                          <span className="ml-2 text-danger font-medium">
                            ({payment.daysUntilDue === 0 ? 'Today!' : `${payment.daysUntilDue} days`})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditing(payment)}
                        className="p-2 text-text-tertiary hover:text-text-secondary transition-colors"
                        title="Edit"
                      >
                        <FaEdit size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(payment.id)}
                        className="p-2 text-text-tertiary hover:text-danger transition-colors"
                        title="Delete"
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Funding Progress */}
                  <div>
                    {payment.isPaid ? (
                      <div className="flex items-center gap-2 py-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-success-light text-success rounded-full">
                          <FaCheck size={12} />
                          <span className="text-sm font-medium">Paid</span>
                        </div>
                        <span className="text-sm text-text-secondary">
                          {fmtCurrency(payment.fundedAmount)} of {fmtCurrency(payment.amount)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-text-secondary">
                            {fmtCurrency(payment.fundedAmount)} of {fmtCurrency(payment.amount)}
                          </span>
                          <span className="font-medium text-text-secondary">
                            {payment.percentFunded.toFixed(0)}% funded
                          </span>
                        </div>
                        <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full transition-all bg-primary"
                            style={{ width: `${Math.min(payment.percentFunded, 100)}%` }}
                          />
                        </div>
                        {payment.frequency !== 'monthly' && (
                          <p className="text-xs text-text-secondary mt-1">
                            Monthly contribution: {fmtCurrency(payment.monthlyContribution)}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
