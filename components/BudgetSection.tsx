"use client";

import { useState } from "react";
import { BudgetCategory, BudgetItem, Transaction } from "@/types/budget";
import { FaTrash } from "react-icons/fa";
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

interface BudgetSectionProps {
  category: BudgetCategory;
  onRefresh: () => void;
  isIncome?: boolean;
  onTransactionClick?: (transaction: Transaction) => void;
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
  setEditingNames: (names: Record<string, string>) => void;
  setEditingValues: (values: Record<string, string | number>) => void;
  isIncome?: boolean;
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
  setEditingNames,
  setEditingValues,
  isIncome = false,
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
      <div className="grid grid-cols-10 gap-4 items-center py-2 rounded">
        <div className="col-span-5 flex items-center gap-2">
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
              className="text-red-600 hover:text-red-700 cursor-pointer"
              title="Delete item"
              type="button"
            >
              <FaTrash className="text-sm" />
            </button>
          )}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 px-1"
            title="Drag to reorder"
          >
            ⋮⋮
          </button>
          {item.transactions.length > 0 && (
            <button
              onClick={() => onToggleExpanded(item.id)}
              className="text-gray-500 hover:text-gray-700"
            >
              {isExpanded ? "▼" : "▶"}
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
            className="flex-1 font-medium text-gray-900 px-2 py-1 border border-transparent hover:bg-gray-50 focus:border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {item.transactions.length > 0 && (
            <span className="text-xs text-gray-500">
              ({item.transactions.length})
            </span>
          )}
        </div>
        <div className="col-span-2">
          <input
            type="text"
            value={
              editingValues[item.id] !== undefined
                ? String(editingValues[item.id])
                : `$${item.planned.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
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
            className={`w-full text-right px-2 py-1 border border-transparent hover:bg-gray-50 focus:border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${isIncome && editingValues[item.id] === undefined ? 'blur-sm' : ''}`}
          />
        </div>
        <div className="col-span-2">
          <div className="text-right px-2 py-1 text-gray-700 font-medium">
            ${item.actual.toFixed(2)}
          </div>
        </div>
        {/* <div className="col-span-2 text-right">
          <span className={difference < 0 ? "text-red-600" : "text-green-600"}>
            ${Math.abs(difference).toFixed(2)}
          </span>
        </div> */}
        <div className="col-span-1"></div>
      </div>

      {/* Progress bar as bottom border */}
      <div className="h-px w-full bg-gray-100">
        <div
          className={`h-full transition-all duration-300 ${
            isOverBudget ? 'bg-red-500 shadow-[0_0_2px_rgba(239,68,68,0.4)]' : 'bg-blue-500 shadow-[0_0_2px_rgba(59,130,246,0.4)]'
          }`}
          style={{ width: `${isOverBudget ? 100 : progressPercent}%` }}
        />
      </div>

      {isExpanded && item.transactions.length > 0 && (
        <div className="ml-8 mb-3 bg-gray-50 rounded p-3">
          <div className="text-xs font-semibold text-gray-600 mb-2">
            Transactions
          </div>
          <div className="space-y-1">
            {item.transactions.map((transaction) => (
              <div
                key={transaction.id}
                onClick={() => onTransactionClick?.(transaction)}
                className="flex items-center justify-between text-sm py-1 hover:bg-white rounded px-2 cursor-pointer transition-colors"
              >
                <div className="flex-1">
                  <span className="text-gray-600">
                    {new Date(transaction.date).toLocaleDateString()}
                  </span>
                  <span className="ml-3 text-gray-900">
                    {transaction.merchant || transaction.description}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    ${transaction.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTransaction(transaction.id);
                    }}
                    className="text-red-600 hover:text-red-800 text-xs"
                  >
                    ×
                  </button>
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
  isIncome = false,
  onTransactionClick,
}: BudgetSectionProps) {
  const [newItemName, setNewItemName] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string | number>>(
    {}
  );
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});

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

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div
          className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between"
        >
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <span>{categoryEmoji}</span>
            <span>{category.name}</span>
          </h2>
          <div className="flex gap-8 text-gray-700">
            <div className="text-right">
              <div className="text-sm opacity-90">Planned</div>
              <div className="text-lg font-semibold">
                ${totalPlanned.toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-90">Actual</div>
              <div className="text-lg font-semibold">
                ${totalActual.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {category.items.length === 0 && !isAddingItem && (
            <p className="text-gray-500 text-center py-4">No items added yet</p>
          )}

          {category.items.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-10 gap-4 text-sm font-semibold text-gray-600 pb-2 border-b">
                <div className="col-span-5">Item</div>
                <div className="col-span-2 text-right">Planned</div>
                <div className="col-span-2 text-right">Actual</div>
                {/* <div className="col-span-2 text-right">Difference</div> */}
                <div className="col-span-1"></div>
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
                      setEditingNames={setEditingNames}
                      setEditingValues={setEditingValues}
                      isIncome={isIncome}
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
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={addItem}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAddingItem(false);
                  setNewItemName("");
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          )}

          {!isAddingItem && (
            <button
              onClick={() => setIsAddingItem(true)}
              className="mt-4 w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              + Add Item
            </button>
          )}
        </div>
      </div>
    </>
  );
}
