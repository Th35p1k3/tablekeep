"use client";

import { useState, useTransition } from "react";
import { addInventoryItem, removeInventoryItem, updateInventoryItem } from "@/lib/inventory/actions";
import { type InventoryItem, totalWeight } from "@/lib/inventory/schema";
import { Card, secondaryButtonClass, selectClass } from "./ui";

type Draft = { name: string; quantity: string; weight: string; notes: string };

const emptyDraft: Draft = { name: "", quantity: "1", weight: "", notes: "" };

function toDraft(item: InventoryItem): Draft {
  return {
    name: item.name,
    quantity: String(item.quantity),
    weight: item.weight === null ? "" : String(item.weight),
    notes: item.notes,
  };
}

function ItemFields({
  idPrefix,
  draft,
  errors,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  errors: Record<string, string>;
  onChange: (next: Draft) => void;
}) {
  const field = (key: keyof Draft, label: string, type = "text") => (
    <div className="space-y-1">
      <label htmlFor={`${idPrefix}-${key}`} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={`${idPrefix}-${key}`}
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={draft[key]}
        onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
        className={selectClass}
      />
      {errors[key] ? <p className="text-sm text-red-700 dark:text-red-400">{errors[key]}</p> : null}
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      {field("name", "Item")}
      {field("quantity", "Quantity", "number")}
      {field("weight", "Weight each", "number")}
      <div className="sm:col-span-3">{field("notes", "Notes")}</div>
    </div>
  );
}

export function InventoryPanel({
  characterId,
  initialItems,
  readOnly = false,
}: {
  characterId: string;
  initialItems: InventoryItem[];
  readOnly?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<{ ok: true; items: InventoryItem[] } | { ok: false; message: string; fieldErrors?: Record<string, string> }>, after?: () => void) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        setItems(result.items);
        setErrors({});
        setMessage(null);
        after?.();
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
      }
    });

  const changeQuantity = (item: InventoryItem, delta: number) =>
    run(() =>
      updateInventoryItem(characterId, item.id, {
        ...toDraft(item),
        quantity: String(Math.max(0, item.quantity + delta)),
      }),
    );

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <p className="text-sm text-stone-600 dark:text-stone-400" data-testid="inventory-total">
          Total weight: {totalWeight(items)}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">Nothing carried yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-700" data-testid="inventory-list">
          {items.map((item) =>
            editing?.id === item.id ? (
              <li key={item.id} className="space-y-3 py-3">
                <ItemFields
                  idPrefix={`edit-${item.id}`}
                  draft={editing.draft}
                  errors={errors}
                  onChange={(d) => setEditing({ id: item.id, draft: d })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    className={secondaryButtonClass}
                    onClick={() => run(() => updateInventoryItem(characterId, item.id, editing.draft), () => setEditing(null))}
                  >
                    Save item
                  </button>
                  <button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 break-words">
                  <span className="font-medium">{item.name}</span>
                  <span className="block text-xs text-stone-600 dark:text-stone-400">
                    {item.weight !== null ? `${item.weight} each` : "no weight"}
                    {item.notes ? ` · ${item.notes}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  {!readOnly ? (
                    <button
                      type="button"
                      disabled={pending || item.quantity === 0}
                      className={`${secondaryButtonClass} px-2.5 py-1.5`}
                      aria-label={`One fewer ${item.name}`}
                      onClick={() => changeQuantity(item, -1)}
                    >
                      −
                    </button>
                  ) : null}
                  <span className="min-w-8 text-center font-mono" aria-label={`${item.name} quantity`}>
                    {item.quantity}
                  </span>
                  {!readOnly ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        className={`${secondaryButtonClass} px-2.5 py-1.5`}
                        aria-label={`One more ${item.name}`}
                        onClick={() => changeQuantity(item, 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={`${secondaryButtonClass} px-2.5 py-1.5`}
                        aria-label={`Edit ${item.name}`}
                        onClick={() => {
                          setErrors({});
                          setEditing({ id: item.id, draft: toDraft(item) });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className={`${secondaryButtonClass} px-2.5 py-1.5 text-red-700 dark:text-red-400`}
                        aria-label={`Remove ${item.name}`}
                        onClick={() => {
                          if (window.confirm(`Remove ${item.name}?`)) run(() => removeInventoryItem(characterId, item.id));
                        }}
                      >
                        ✕
                      </button>
                    </>
                  ) : null}
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {!readOnly ? (
        <div className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-700">
          <h3 className="text-sm font-semibold">Add an item</h3>
          <ItemFields idPrefix="new-item" draft={draft} errors={editing ? {} : errors} onChange={setDraft} />
          <button
            type="button"
            disabled={pending}
            className={secondaryButtonClass}
            onClick={() => run(() => addInventoryItem(characterId, draft), () => setDraft(emptyDraft))}
          >
            Add item
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-red-700 dark:text-red-400">{message}</p> : null}
    </Card>
  );
}
