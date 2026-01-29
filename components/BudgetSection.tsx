"use client";

import { useState } from "react";
import { BudgetCategory, BudgetItem, Transaction } from "@/types/budget";
import { FaTrash, FaChevronDown, FaChevronRight } from "react-icons/fa";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency } from "@/lib/formatCurrency";

interface BudgetSectionProps {
  category: BudgetCategory;
  onRefresh: () => void;
  onTransactionClick?: (transaction: Transaction) => void;
  onSplitClick?: (parentTransactionId: string) => void;
  onItemClick?: (item: BudgetItem, categoryName: string) => void;
  selectedItemId?: string;
}

interface SortableItemProps {
  item: BudgetItem;
  index: number;
  totalItems: number;
  isExpanded: boolean;
  editingNames: Record<string, string>;
  editingValues: Record<string, string | number>;
  onToggleExpanded: (id: string) => void;
  onUpdateName: (id: string, name: string) => void;
  onUpdatePlanned: (id: string, value: number) => void;
  onDelete: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
  onTransactionClick?: (transaction: Transaction) => void;
  onSplitClick?: (parentTransactionId: string) => void;
  setEditingNames: (names: Record<string, string>) => void;
  setEditingValues: (values: Record<string, string | number>) => void;
  onItemClick?: (item: BudgetItem) => void;
  isSelected?: boolean;
  showRemaining?: boolean;
}

function SortableItem({
  item,
  isExpanded,
  editingNames,
  editingValues,
  onToggleExpanded,
  onUpdateName,
  onUpdatePlanned,
  onDelete,
  onDeleteTransaction,
  onTransactionClick,
  onSplitClick,
  setEditingNames,
  setEditingValues,
  onItemClick,
  isSelected = false,
  showRemaining = false,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const difference = item.planned - item.actual;
  const progressPercent = item.planned > 0 ? Math.min((item.actual / item.planned) * 100, 100) : 0;
  const isOverBudget = item.actual > item.planned;

  const isEditing =
    editingNames[item.id] !== undefined || editingValues[item.id] !== undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
    >
      <div
        onClick={() => onItemClick?.(item)}
        className={`grid grid-cols-10 gap-4 items-center py-2 rounded cursor-pointer transition-colors ${
          isSelected ? 'bg-primary-light ring-1 ring-primary-border' : 'hover:bg-surface-secondary'
        }`}
      >
        <div className="col-span-6 flex items-center gap-2">
          {isEditing && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(item.id);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              className="text-danger hover:text-danger cursor-pointer"
              title="Delete item"
              type="button"
            >
              <FaTrash className="text-sm" />
            </button>
          )}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-secondary px-1"
            title="Drag to reorder"
          >
            ⋮⋮
          </button>
          {(item.transactions.length > 0 || (item.splitTransactions?.length || 0) > 0) && (
            <button
              onClick={() => onToggleExpanded(item.id)}
              className="text-text-secondary hover:text-text-primary"
            >
              {isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
            </button>
          )}
          <input
            type="text"
            value={
              editingNames[item.id] !== undefined
                ? editingNames[item.id]
                : item.name
            }
            onChange={(e) => {
              setEditingNames({ ...editingNames, [item.id]: e.target.value });
            }}
            onFocus={(e) => {
              e.target.select();
              setEditingNames({ ...editingNames, [item.id]: item.name });
            }}
            onBlur={() => {
              if (editingNames[item.id] !== undefined) {
                onUpdateName(item.id, editingNames[item.id]);
                const newNames = { ...editingNames };
                delete newNames[item.id];
                setEditingNames(newNames);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="flex-1 font-medium text-text-primary px-2 py-1 border border-transparent hover:bg-surface-secondary focus:border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {item.recurringPaymentId && (
            <span className="text-xs text-primary" title="Recurring payment">
              🔄
            </span>
          )}
          {(item.transactions.length > 0 || (item.splitTransactions?.length || 0) > 0) && (
            <span className="text-xs text-text-secondary">
              ({item.transactions.length + (item.splitTransactions?.length || 0)})
            </span>
          )}
        </div>
        <div className="col-span-2">
          <input
            type="text"
            value={
              editingValues[item.id] !== undefined
                ? String(editingValues[item.id])
                : `$${formatCurrency(item.planned)}`
            }
            onChange={(e) => {
              const value = e.target.value.replace(/[$,]/g, "");
              setEditingValues({
                ...editingValues,
                [item.id]: value,
              });
            }}
            onFocus={(e) => {
              const numValue = item.planned;
              setEditingValues({ ...editingValues, [item.id]: numValue });
              setTimeout(() => e.target.select(), 0);
            }}
            onBlur={() => {
              if (editingValues[item.id] !== undefined) {
                const numValue = parseFloat(String(editingValues[item.id])) || 0;
                onUpdatePlanned(item.id, numValue);
                const newValues = { ...editingValues };
                delete newValues[item.id];
                setEditingValues(newValues);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="w-full text-right px-2 py-1 border border-transparent hover:bg-surface-secondary focus:border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="col-span-2">
          <div className="text-right px-2 py-1 text-text-secondary font-medium">
            ${showRemaining ? formatCurrency(item.planned - item.actual) : formatCurrency(item.actual)}
          </div>
        </div>
      </div>

      {/* Progress bar as bottom border */}
      <div className="h-px w-full bg-surface-secondary">
        <div
          className={`h-full transition-all duration-300 ${
            isOverBudget ? 'bg-danger shadow-[0_0_2px_rgba(239,68,68,0.4)]' : 'bg-success shadow-[0_0_2px_rgba(16,185,129,0.4)]'
          }`}
          style={{ width: `${isOverBudget ? 100 : progressPercent}%` }}
        />
      </div>

      {isExpanded && (item.transactions.length > 0 || (item.splitTransactions?.length || 0) > 0) && (
        <div className="ml-8 mb-3 bg-surface-secondary rounded p-3">
          <div className="text-xs font-semibold text-text-secondary mb-2">
            Transactions
          </div>
          <div className="space-y-1">
            {[...item.transactions]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((transaction) => (
              <div
                key={transaction.id}
                onClick={() => onTransactionClick?.(transaction)}
                className="flex items-center justify-between text-sm py-1 hover:bg-surface rounded px-2 cursor-pointer transition-colors"
              >
                <div className="flex-1">
                  <span className="text-text-secondary">
                    {new Date(transaction.date).toLocaleDateString()}
                  </span>
                  <span className="ml-3 text-text-primary">
                    {transaction.merchant || transaction.description}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${transaction.type === 'income' ? 'text-success' : 'text-text-primary'}`}>
                    {transaction.type === 'income' ? '+' : ''}${formatCurrency(transaction.amount)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTransaction(transaction.id);
                    }}
                    className="text-danger hover:text-danger text-xs"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            {/* Split transactions */}
            {[...(item.splitTransactions || [])]
              .sort((a, b) => new Date(b.parentDate || '').getTime() - new Date(a.parentDate || '').getTime())
              .map((split) => (
              <div
                key={`split-${split.id}`}
                onClick={() => onSplitClick?.(split.parentTransactionId)}
                className="flex items-center justify-between text-sm py-1 px-2 bg-accent-purple-light rounded cursor-pointer hover:bg-accent-purple-light transition-colors"
              >
                <div className="flex-1">
                  <span className="text-text-secondary">
                    {split.parentDate ? new Date(split.parentDate).toLocaleDateString() : '—'}
                  </span>
                  <span className="ml-3 text-text-primary">
                    {split.description || split.parentMerchant || split.parentDescription || 'Split'}
                  </span>
                  <span className="ml-2 text-xs text-accent-purple">(split)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${split.parentType === 'income' ? 'text-success' : 'text-text-primary'}`}>
                    {split.parentType === 'income' ? '+' : ''}${formatCurrency(split.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Map category names to emojis
const getCategoryEmoji = (categoryName: string): string => {
  const emojiMap: Record<string, string> = {
    'Income': '💰',
    'Giving': '🤲',
    'Household': '🏠',
    'Transportation': '🚗',
    'Food': '🍽️',
    'Personal': '👤',
    'Insurance': '🛡️',
    'Saving': '💵',
  };
  return emojiMap[categoryName] || '📋';
};

export default function BudgetSection({
  category,
  onRefresh,
  onTransactionClick,
  onSplitClick,
  onItemClick,
  selectedItemId,
}: BudgetSectionProps) {
  const [newItemName, setNewItemName] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string | number>>(
    {}
  );
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [showRemaining, setShowRemaining] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addItem = async () => {
    if (!newItemName.trim()) return;
    if (!category.dbId) {
      console.error("Category database ID not found");
      return;
    }

    try {
      const response = await fetch("/api/budget-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: category.dbId,
          name: newItemName,
          planned: 0,
        }),
      });

      if (response.ok) {
        setNewItemName("");
        setIsAddingItem(false);
        onRefresh();
      }
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const updateItemPlanned = async (itemId: string, value: number) => {
    try {
      await fetch("/api/budget-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: itemId,
          planned: value,
        }),
      });
      onRefresh();
    } catch (error) {
      console.error("Error updating item:", error);
    }
  };

  const updateItemName = async (itemId: string, name: string) => {
    if (!name.trim()) return;
    try {
      await fetch("/api/budget-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: itemId,
          name: name.trim(),
        }),
      });
      onRefresh();
    } catch (error) {
      console.error("Error updating item name:", error);
    }
  };

  const uncategorizeTransaction = async (transactionId: string) => {
    try {
      await fetch("/api/transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transactionId,
          budgetItemId: null,
        }),
      });
      onRefresh();
    } catch (error) {
      console.error("Error uncategorizing transaction:", error);
    }
  };

  const deleteItem = async (itemId: string) => {
    // Clear editing state for this item
    const newNames = { ...editingNames };
    const newValues = { ...editingValues };
    delete newNames[itemId];
    delete newValues[itemId];
    setEditingNames(newNames);
    setEditingValues(newValues);

    try {
      const response = await fetch(`/api/budget-items?id=${itemId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = category.items.findIndex(
        (item) => item.id === active.id
      );
      const newIndex = category.items.findIndex((item) => item.id === over.id);

      const reorderedItems = arrayMove(category.items, oldIndex, newIndex);

      const updates = reorderedItems.map((item, index) => ({
        id: item.id,
        order: index,
      }));

      try {
        await fetch("/api/budget-items/reorder", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: updates }),
        });
        onRefresh();
      } catch (error) {
        console.error("Error reordering items:", error);
      }
    }
  };

  const totalPlanned = category.items.reduce(
    (sum, item) => sum + item.planned,
    0
  );
  const totalActual = category.items.reduce(
    (sum, item) => sum + item.actual,
    0
  );

  const categoryEmoji = getCategoryEmoji(category.name);
  const isFulfilled = totalPlanned > 0 && Math.abs(totalPlanned - totalActual) < 0.01;
  const isIncome = category.name === 'Income';
  const actualLabel = isIncome ? 'Received' : 'Spent';

  return (
    <>
      <div className="bg-surface rounded-lg shadow-sm overflow-hidden">
        <div className="bg-surface border-b border-border px-6 py-4">
          <div className="grid grid-cols-10 gap-4 items-center">
            <h2 className="col-span-6 text-xl font-semibold text-text-primary flex items-center gap-2">
              <span>{categoryEmoji}</span>
              <span>{category.name}</span>
              {isFulfilled && (
                <span className="text-success text-base" title="Category fulfilled">✓</span>
              )}
            </h2>
            <div className="col-span-2 text-right text-text-secondary">
              <div className="text-sm opacity-90">Planned</div>
              <div className="text-lg font-semibold">
                ${formatCurrency(totalPlanned)}
              </div>
            </div>
            <div
              className="col-span-2 text-right text-text-secondary cursor-pointer hover:bg-surface-secondary rounded px-2 py-1 -mx-2 -my-1 transition-colors"
              onClick={() => setShowRemaining(!showRemaining)}
              title="Click to toggle between Actual and Remaining"
            >
              <div className="text-sm opacity-90">{showRemaining ? 'Remaining' : actualLabel}</div>
              <div className="text-lg font-semibold">
                ${showRemaining ? formatCurrency(totalPlanned - totalActual) : formatCurrency(totalActual)}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {category.items.length === 0 && !isAddingItem && (
            <p className="text-text-secondary text-center py-4">No items added yet</p>
          )}

          {category.items.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-10 gap-4 text-sm font-semibold text-text-secondary pb-2 border-b">
                <div className="col-span-6">Item</div>
                <div className="col-span-2 text-right">Planned</div>
                <div className="col-span-2 text-right">{showRemaining ? 'Remaining' : actualLabel}</div>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={category.items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {category.items.map((item, index) => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      index={index}
                      totalItems={category.items.length}
                      isExpanded={expandedItemId === item.id}
                      editingNames={editingNames}
                      editingValues={editingValues}
                      onToggleExpanded={toggleExpanded}
                      onUpdateName={updateItemName}
                      onUpdatePlanned={updateItemPlanned}
                      onDelete={deleteItem}
                      onDeleteTransaction={uncategorizeTransaction}
                      onTransactionClick={onTransactionClick}
                      onSplitClick={onSplitClick}
                      setEditingNames={setEditingNames}
                      setEditingValues={setEditingValues}
                      onItemClick={(item) => onItemClick?.(item, category.name)}
                      isSelected={selectedItemId === item.id}
                      showRemaining={showRemaining}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}

          {isAddingItem && (
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
                onFocus={(e) => e.target.select()}
                placeholder="Item name"
                className="flex-1 px-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              <button
                onClick={addItem}
                className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAddingItem(false);
                  setNewItemName("");
                }}
                className="px-4 py-2 bg-surface-secondary text-text-secondary rounded hover:bg-surface-secondary"
              >
                Cancel
              </button>
            </div>
          )}

          {!isAddingItem && (
            <button
              onClick={() => setIsAddingItem(true)}
              className="mt-4 text-sm text-text-tertiary hover:text-primary transition-colors cursor-pointer"
            >
              Add Item
            </button>
          )}
        </div>
      </div>
    </>
  );
}
