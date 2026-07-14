"use client";

import { useState, useEffect } from "react";
import { BudgetItem } from "@/types/budget";
import { getCategoryEmoji } from "@/lib/chartColors";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CurrencyInput from "@/components/ui/CurrencyInput";

interface LinkedAccount {
  id: number;
  accountName: string;
  institutionName: string;
  lastFour: string;
  accountSubtype: string;
}

export interface CategoryOption {
  key: string;
  name: string;
  emoji?: string | null;
}

export interface TransactionToEdit {
  id: number;
  budgetItemId?: number | null;
  linkedAccountId?: number | null;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  merchant?: string | null;
  tagCategoryType?: string | null;
  isNonEarned?: boolean;
}

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransaction: (transaction: {
    budgetItemId: string;
    linkedAccountId?: number;
    date: string;
    description: string;
    amount: number;
    type: "income" | "expense";
    merchant?: string;
    tagCategoryType?: string;
    isNonEarned?: boolean;
  }) => void;
  onEditTransaction?: (transaction: {
    id: number;
    budgetItemId: string;
    linkedAccountId?: number;
    date: string;
    description: string;
    amount: number;
    type: "income" | "expense";
    merchant?: string;
    tagCategoryType?: string;
    isNonEarned?: boolean;
  }) => void;
  onDeleteTransaction?: (id: number) => void;
  budgetItems: { category: string; items: BudgetItem[] }[];
  categories?: CategoryOption[];
  linkedAccounts?: LinkedAccount[];
  transactionToEdit?: TransactionToEdit | null;
}

export default function AddTransactionModal({
  isOpen,
  onClose,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  budgetItems,
  categories = [],
  linkedAccounts = [],
  transactionToEdit,
}: AddTransactionModalProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [merchant, setMerchant] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState<string>("");
  const [budgetItemId, setBudgetItemId] = useState("");
  const [tagCategoryType, setTagCategoryType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [isNonEarned, setIsNonEarned] = useState(false);

  const isEditMode = !!transactionToEdit;
  // Editing a transaction that isn't assigned to a budget item yet — allow saving without one
  const allowUncategorized = isEditMode && !transactionToEdit?.budgetItemId;

  // Populate form when editing
  useEffect(() => {
    if (transactionToEdit) {
      setType(transactionToEdit.type);
      setAmount(transactionToEdit.amount.toString());
      setDate(transactionToEdit.date);
      setMerchant(transactionToEdit.merchant || "");
      setLinkedAccountId(transactionToEdit.linkedAccountId?.toString() || "");
      setBudgetItemId(transactionToEdit.budgetItemId?.toString() || "");
      setTagCategoryType(transactionToEdit.tagCategoryType || "");
      // Hide legacy auto-filled descriptions (merchant mirror / filler) — Notes is user context only
      const desc = transactionToEdit.description || "";
      const isAutoFilled =
        desc === "Manual transaction" ||
        (!!transactionToEdit.merchant &&
          desc.toLowerCase() === transactionToEdit.merchant.toLowerCase());
      setDescription(isAutoFilled ? "" : desc);
      setIsNonEarned(transactionToEdit.isNonEarned || false);
    } else {
      // Reset form for new transaction
      setType("expense");
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setMerchant("");
      setLinkedAccountId("");
      setBudgetItemId("");
      setTagCategoryType("");
      setDescription("");
      setIsNonEarned(false);
    }
  }, [transactionToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || (!budgetItemId && !allowUncategorized)) return;

    // Notes hold user-entered context only — never mirror the merchant into description.
    // Lists render `merchant || description`, so a filler is only needed when both are empty.
    const descriptionValue =
      description.trim() || (merchant.trim() ? "" : "Manual transaction");

    const transactionData = {
      budgetItemId,
      linkedAccountId: linkedAccountId ? parseInt(linkedAccountId) : undefined,
      date,
      description: descriptionValue,
      amount: parseFloat(amount),
      type,
      merchant: merchant.trim() || undefined,
      tagCategoryType: tagCategoryType || undefined,
      isNonEarned: type === "income" ? isNonEarned : undefined,
    };

    if (isEditMode && onEditTransaction) {
      onEditTransaction({
        id: transactionToEdit.id,
        ...transactionData,
      });
    } else {
      onAddTransaction(transactionData);
    }

    // Reset form
    setType("expense");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setMerchant("");
    setLinkedAccountId("");
    setBudgetItemId("");
    setTagCategoryType("");
    setDescription("");
    setIsNonEarned(false);
    onClose();
  };

  const handleDelete = () => {
    if (!transactionToEdit || !onDeleteTransaction) return;
    if (!confirm("Delete this transaction?")) return;

    onDeleteTransaction(transactionToEdit.id);
    onClose();
  };

  if (!isOpen) return null;

  // Check if account is already linked (from Teller sync)
  const hasLinkedAccount = isEditMode && transactionToEdit?.linkedAccountId;
  const linkedAccountDisplay = hasLinkedAccount
    ? linkedAccounts.find((a) => a.id === transactionToEdit.linkedAccountId)
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? "Edit Transaction" : "Add Transaction"}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type - Radio buttons */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="expense"
                  checked={type === "expense"}
                  onChange={(e) => setType(e.target.value as "expense")}
                  className="mr-2 w-4 h-4 text-primary"
                />
                <span className="text-sm text-text-secondary">Expense</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="income"
                  checked={type === "income"}
                  onChange={(e) => setType(e.target.value as "income")}
                  className="mr-2 w-4 h-4 text-primary"
                />
                <span className="text-sm text-text-secondary">Income</span>
              </label>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Amount
            </label>
            <CurrencyInput
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              autoFocus
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Date
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Merchant */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Where did you spend this money?
            </label>
            <Input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="e.g., Costco, Amazon, Target"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Notes{" "}
              <span className="text-text-tertiary text-xs">(optional)</span>
            </label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="e.g., Secret Santa Gift"
            />
          </div>

          {/* Account - read-only if already linked, editable otherwise */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Account{" "}
              <span className="text-text-tertiary text-xs">(optional)</span>
            </label>
            {hasLinkedAccount && linkedAccountDisplay ? (
              <div className="w-full px-3 py-2 border border-border rounded-lg bg-surface-secondary text-text-secondary">
                {linkedAccountDisplay.institutionName} -{" "}
                {linkedAccountDisplay.accountName} *
                {linkedAccountDisplay.lastFour}
              </div>
            ) : (
              <Select
                value={linkedAccountId}
                onChange={(e) => setLinkedAccountId(e.target.value)}
              >
                <option value="">Select an account...</option>
                {linkedAccounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.institutionName} - {acct.accountName} *{acct.lastFour}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {/* Budget Item Dropdown */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Budget Item
            </label>
            <Select
              value={budgetItemId}
              onChange={(e) => setBudgetItemId(e.target.value)}
              required={!allowUncategorized}
            >
              <option value="">
                {allowUncategorized
                  ? "Uncategorized (assign later)"
                  : "Select a budget item..."}
              </option>
              {budgetItems.map((group) => (
                <optgroup key={group.category} label={group.category}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>

          {/* Report As Tag (optional) */}
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Report as{" "}
                <span className="text-text-tertiary text-xs">(optional)</span>
              </label>
              <Select
                value={tagCategoryType}
                onChange={(e) => setTagCategoryType(e.target.value)}
              >
                <option value="">None — use budget item category</option>
                {categories.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {getCategoryEmoji(cat.key, cat.emoji)} {cat.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Non-earned income toggle - only visible for income type */}
          {type === "income" && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="nonEarned"
                checked={isNonEarned}
                onChange={(e) => setIsNonEarned(e.target.checked)}
                className="w-4 h-4 text-primary rounded border-border-strong focus:ring-primary"
              />
              <label
                htmlFor="nonEarned"
                className="text-sm text-text-secondary"
              >
                Non-earned income{" "}
                <span className="text-text-tertiary text-xs">
                  (gifts, refunds, etc.)
                </span>
              </label>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <Button type="submit" className="flex-1">
              {isEditMode ? "Save Changes" : "Add Transaction"}
            </Button>
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>

          {/* Delete button - only in edit mode */}
          {isEditMode && onDeleteTransaction && (
            <Button variant="dangerGhost" onClick={handleDelete} className="w-full mt-2">
              Delete Transaction
            </Button>
          )}
        </form>
    </Modal>
  );
}
