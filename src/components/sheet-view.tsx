"use client";

import { useMemo, useState } from "react";
import { type SheetInput, computeSheet, formatValue } from "@/lib/templates/compute";
import type { TemplateDefinition, TemplateField } from "@/lib/templates/schema";
import { selectClass } from "./ui";

const inputClass = selectClass;

function read(values: SheetInput, key: string): unknown {
  return Object.hasOwn(values, key) ? values[key] : undefined;
}

function asText(value: unknown, fallback: unknown = ""): string {
  if (value === undefined || value === null) {
    return fallback === undefined || fallback === null ? "" : String(fallback);
  }
  return String(value);
}

/**
 * Shows a sheet built from a template, with calculated values updating as
 * you type. Used for the template preview now and character sheets later.
 */
export function SheetView({
  definition,
  values,
  onChange,
  idPrefix = "sheet",
  onRefill,
  readOnly = false,
}: {
  definition: TemplateDefinition;
  values: SheetInput;
  onChange: (key: string, value: unknown) => void;
  idPrefix?: string;
  /** When given, resources get a "Refill" button that calls this. */
  onRefill?: (key: string) => void;
  /** Show values without letting anyone change them. */
  readOnly?: boolean;
}) {
  const computed = useMemo(() => computeSheet(definition, values), [definition, values]);

  const renderField = (field: TemplateField) => {
    const id = `${idPrefix}-${field.id}`;
    const error = computed.errors.get(field.key);
    const label = (
      <label htmlFor={id} className="block text-sm font-medium">
        {field.label}
      </label>
    );
    const help = field.help ? (
      <p className="text-xs text-stone-600 dark:text-stone-400">{field.help}</p>
    ) : null;
    const problem = error ? (
      <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
    ) : null;

    switch (field.type) {
      case "number":
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <input
              id={id}
              type="number"
              inputMode="decimal"
              min={field.min}
              max={field.max}
              value={asText(read(values, field.key), field.default)}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={readOnly}
              className={inputClass}
            />
            {help}
          </div>
        );
      case "text":
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <input
              id={id}
              type="text"
              value={asText(read(values, field.key), field.default)}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={readOnly}
              className={inputClass}
            />
            {help}
          </div>
        );
      case "longtext":
        return (
          <div key={field.id} className="space-y-1 sm:col-span-2">
            {label}
            <textarea
              id={id}
              rows={3}
              value={asText(read(values, field.key), field.default)}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={readOnly}
              className={inputClass}
            />
            {help}
          </div>
        );
      case "checkbox": {
        const raw = read(values, field.key);
        const checked = typeof raw === "boolean" ? raw : Boolean(field.default);
        return (
          <div key={field.id} className="space-y-1">
            <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
              <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(field.key, e.target.checked)}
                disabled={readOnly}
                className="h-5 w-5 accent-amber-800"
              />
              {field.label}
            </label>
            {help}
          </div>
        );
      }
      case "choice":
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <select
              id={id}
              value={asText(read(values, field.key), field.default)}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={readOnly}
              className={inputClass}
            >
              <option value="">—</option>
              {(Array.isArray(field.options) ? field.options : []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {help}
          </div>
        );
      case "resource": {
        const max = computed.maxima.get(field.key);
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <div className="flex items-center gap-2">
              <input
                id={id}
                type="number"
                inputMode="decimal"
                value={asText(read(values, field.key), max)}
                onChange={(e) => onChange(field.key, e.target.value)}
                disabled={readOnly}
                className={`${inputClass} w-28`}
              />
              <span className="text-sm text-stone-600 dark:text-stone-400" data-testid={`max-${field.key}`}>
                of {formatValue(max)}
              </span>
              {onRefill && !readOnly && max !== undefined ? (
                <button
                  type="button"
                  onClick={() => onRefill(field.key)}
                  aria-label={`Refill ${field.label}`}
                  className="rounded-md border border-stone-300 px-2.5 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  Refill
                </button>
              ) : null}
            </div>
            {help}
            {problem}
          </div>
        );
      }
      case "calculated":
        return (
          <div key={field.id} className="space-y-1">
            <span id={id} className="block text-sm font-medium">
              {field.label}
            </span>
            <output
              aria-labelledby={id}
              data-testid={`calc-${field.key}`}
              className="block rounded-md bg-stone-100 px-3 py-2 font-mono text-base dark:bg-stone-800"
            >
              {error ? "—" : formatValue(computed.values.get(field.key), field.format)}
            </output>
            {help}
            {problem}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {definition.sections.map((section) => (
        <section key={section.id}>
          <h3 className="mb-3 border-b border-stone-200 pb-1 text-base font-semibold dark:border-stone-700">
            {section.title || "Untitled section"}
          </h3>
          {section.fields.length === 0 ? (
            <p className="text-sm text-stone-600 dark:text-stone-400">No fields yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">{section.fields.map(renderField)}</div>
          )}
        </section>
      ))}
    </div>
  );
}

/** A sheet preview that keeps its own made-up values (nothing is saved). */
export function SheetPreview({ definition, idPrefix }: { definition: TemplateDefinition; idPrefix?: string }) {
  const [values, setValues] = useState<SheetInput>({});
  return (
    <SheetView
      definition={definition}
      values={values}
      idPrefix={idPrefix}
      onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
    />
  );
}

/** A finished sheet shown to someone who may look but not edit (a DM, say). */
export function ReadOnlySheet({ definition, values }: { definition: TemplateDefinition; values: SheetInput }) {
  return <SheetView definition={definition} values={values} idPrefix="view" readOnly onChange={() => {}} />;
}
