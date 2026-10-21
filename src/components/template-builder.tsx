"use client";

import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FUNCTIONS } from "@/lib/formula";
import { publishTemplateDraft, saveTemplateDraft } from "@/lib/templates/actions";
import {
  allKeys,
  moveItem,
  newField,
  newId,
  numericKeys,
  slugify,
  uniqueKey,
  withType,
} from "@/lib/templates/editing";
import {
  FIELD_TYPE_LABEL,
  type FieldType,
  type TemplateDefinition,
  type TemplateField,
  type TemplateSection,
  templateDefinitionSchema,
} from "@/lib/templates/schema";
import { type TemplateIssue, validateTemplate } from "@/lib/templates/validate";
import { SheetPreview } from "./sheet-view";
import { Card, secondaryButtonClass, selectClass } from "./ui";

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABEL) as FieldType[];
const smallButton = `${secondaryButtonClass} px-2.5 py-1.5`;

function numberOrUndefined(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

function Labeled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldEditor({
  field,
  definition,
  issues,
  onChange,
}: {
  field: TemplateField;
  definition: TemplateDefinition;
  issues: TemplateIssue[];
  onChange: (next: TemplateField) => void;
}) {
  const id = (name: string) => `edit-${name}-${field.id}`;
  const [optionsText, setOptionsText] = useState(
    field.type === "choice" ? field.options.join("\n") : "",
  );
  const available = useMemo(
    () => numericKeys(definition).filter((k) => k !== field.key && !k.startsWith(`${field.key}.`)),
    [definition, field.key],
  );

  const setLabel = (label: string) => {
    // Keep the short name in step with the label until someone edits it.
    const autoKey = field.key === slugify(field.label);
    onChange({
      ...field,
      label,
      key: autoKey ? uniqueKey(slugify(label), allKeys(definition, field.id)) : field.key,
    });
  };

  const formulaHelp = (
    <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
      Fields you can use: {available.length ? available.slice(0, 30).join(", ") : "none yet"}.
      <br />
      Functions: {[...FUNCTIONS.keys()].join(", ")}.
    </p>
  );

  return (
    <div className="space-y-4 border-t border-stone-200 pt-4 dark:border-stone-700">
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled id={id("label")} label="Label">
          <input id={id("label")} value={field.label} onChange={(e) => setLabel(e.target.value)} className={selectClass} />
        </Labeled>
        <Labeled id={id("key")} label="Short name (used in formulas)">
          <input
            id={id("key")}
            value={field.key}
            onChange={(e) => onChange({ ...field, key: e.target.value })}
            className={`${selectClass} font-mono`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Labeled>
        <Labeled id={id("type")} label="Type">
          <select
            id={id("type")}
            value={field.type}
            onChange={(e) => onChange(withType(field, e.target.value as FieldType))}
            className={selectClass}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled id={id("help")} label="Help text (optional)">
          <input
            id={id("help")}
            value={field.help ?? ""}
            onChange={(e) => onChange({ ...field, help: e.target.value || undefined })}
            className={selectClass}
          />
        </Labeled>
      </div>

      {field.type === "number" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {(["default", "min", "max"] as const).map((prop) => (
            <Labeled key={prop} id={id(prop)} label={prop === "default" ? "Default" : prop === "min" ? "Minimum" : "Maximum"}>
              <input
                id={id(prop)}
                type="number"
                value={field[prop] ?? ""}
                onChange={(e) => {
                  const v = numberOrUndefined(e.target.value);
                  onChange(
                    prop === "default"
                      ? { ...field, default: v }
                      : prop === "min"
                        ? { ...field, min: v }
                        : { ...field, max: v },
                  );
                }}
                className={selectClass}
              />
            </Labeled>
          ))}
        </div>
      ) : null}

      {field.type === "text" ? (
        <Labeled id={id("default")} label="Default text (optional)">
          <input
            id={id("default")}
            value={field.default ?? ""}
            onChange={(e) => onChange({ ...field, default: e.target.value || undefined })}
            className={selectClass}
          />
        </Labeled>
      ) : null}

      {field.type === "longtext" ? (
        <Labeled id={id("default")} label="Default text (optional)">
          <textarea
            id={id("default")}
            rows={3}
            value={field.default ?? ""}
            onChange={(e) => onChange({ ...field, default: e.target.value || undefined })}
            className={selectClass}
          />
        </Labeled>
      ) : null}

      {field.type === "checkbox" ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={Boolean(field.default)}
            onChange={(e) => onChange({ ...field, default: e.target.checked })}
            className="h-5 w-5 accent-amber-800"
          />
          Ticked by default
        </label>
      ) : null}

      {field.type === "choice" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled id={id("options")} label="Options (one per line)">
            <textarea
              id={id("options")}
              rows={4}
              value={optionsText}
              onChange={(e) => {
                setOptionsText(e.target.value);
                const options = e.target.value.split("\n").map((o) => o.trim()).filter(Boolean);
                onChange({
                  ...field,
                  options,
                  default: field.default && options.includes(field.default) ? field.default : undefined,
                });
              }}
              className={selectClass}
            />
          </Labeled>
          <Labeled id={id("default")} label="Default choice">
            <select
              id={id("default")}
              value={field.default ?? ""}
              onChange={(e) => onChange({ ...field, default: e.target.value || undefined })}
              className={selectClass}
            >
              <option value="">(none)</option>
              {field.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
      ) : null}

      {field.type === "resource" ? (
        <div className="space-y-2">
          <Labeled id={id("max")} label="Maximum (a number or a formula)">
            <input
              id={id("max")}
              value={field.maxFormula}
              onChange={(e) => onChange({ ...field, maxFormula: e.target.value })}
              className={`${selectClass} font-mono`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Labeled>
          {formulaHelp}
        </div>
      ) : null}

      {field.type === "calculated" ? (
        <div className="space-y-2">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Labeled id={id("formula")} label="Formula">
              <input
                id={id("formula")}
                value={field.formula}
                onChange={(e) => onChange({ ...field, formula: e.target.value })}
                className={`${selectClass} font-mono`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Labeled>
            <Labeled id={id("format")} label="Show as">
              <select
                id={id("format")}
                value={field.format}
                onChange={(e) => onChange({ ...field, format: e.target.value === "modifier" ? "modifier" : "number" })}
                className={selectClass}
              >
                <option value="number">Number (7)</option>
                <option value="modifier">Modifier (+2)</option>
              </select>
            </Labeled>
          </div>
          {formulaHelp}
        </div>
      ) : null}

      {issues.length ? (
        <ul className="space-y-1 text-sm text-red-700 dark:text-red-400" data-testid="field-problems">
          {issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TemplateBuilder({
  templateId,
  initial,
  nextVersion,
}: {
  templateId: string;
  initial: TemplateDefinition;
  nextVersion: number;
}) {
  const router = useRouter();
  const [definition, setDefinition] = useState<TemplateDefinition>(initial);
  const [saved, setSaved] = useState<TemplateDefinition>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [newType, setNewType] = useState<Record<string, FieldType>>({});
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(() => JSON.stringify(definition) !== JSON.stringify(saved), [definition, saved]);
  const validation = useMemo(() => validateTemplate(definition), [definition]);
  const issues = validation.ok ? [] : validation.issues;
  const canSave = useMemo(() => templateDefinitionSchema.safeParse(definition).success, [definition]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (next: TemplateDefinition) => {
    setDefinition(next);
    setStatus(null);
  };
  const updateSections = (fn: (sections: TemplateSection[]) => TemplateSection[]) =>
    change({ ...definition, sections: fn(definition.sections) });
  const updateSection = (sectionId: string, fn: (s: TemplateSection) => TemplateSection) =>
    updateSections((ss) => ss.map((s) => (s.id === sectionId ? fn(s) : s)));

  const addField = (section: TemplateSection) => {
    const field = newField(newType[section.id] ?? "number", allKeys(definition));
    updateSection(section.id, (s) => ({ ...s, fields: [...s.fields, field] }));
    setEditing(field.id);
  };

  const save = () =>
    startTransition(async () => {
      const snapshot = definition;
      const result = await saveTemplateDraft(templateId, snapshot);
      if (result.ok) {
        setSaved(snapshot);
        setStatus({ tone: "success", text: "All changes saved." });
      } else {
        setStatus({ tone: "error", text: result.message });
      }
    });

  const publish = () => {
    if (!window.confirm(`Publish version ${nextVersion}? Published versions can’t be changed afterwards.`)) return;
    startTransition(async () => {
      const snapshot = definition;
      const result = await publishTemplateDraft(templateId, snapshot);
      if (result.ok) {
        setSaved(snapshot);
        setStatus({ tone: "success", text: `Published version ${result.version}.` });
        router.refresh();
      } else {
        setStatus({ tone: "error", text: result.message });
      }
    });
  };

  const issuesFor = (si: number, fi: number) =>
    issues.filter((i) => i.path === `sections.${si}.fields.${fi}` || i.path.startsWith(`sections.${si}.fields.${fi}.`));

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium" data-testid="save-status" aria-live="polite">
              {pending ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={save} disabled={pending || !dirty || !canSave} className={secondaryButtonClass}>
                Save draft
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={pending || issues.length > 0}
                className="inline-flex items-center justify-center rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-60"
              >
                Publish version {nextVersion}
              </button>
            </div>
          </div>
          {status ? (
            <p
              data-testid="form-message"
              className={`mt-3 text-sm ${status.tone === "error" ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}
            >
              {status.text}
            </p>
          ) : null}
          {issues.length ? (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <p className="font-medium">
                {issues.length} problem{issues.length === 1 ? "" : "s"} to fix before publishing
                {canSave ? "" : " (or saving)"}:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="template-problems">
                {issues.slice(0, 8).map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        {definition.sections.map((section, si) => (
          <Card key={section.id}>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Labeled id={`section-title-${section.id}`} label={`Section ${si + 1} title`}>
                  <input
                    id={`section-title-${section.id}`}
                    value={section.title}
                    onChange={(e) => updateSection(section.id, (s) => ({ ...s, title: e.target.value }))}
                    className={selectClass}
                  />
                </Labeled>
              </div>
              <button type="button" className={smallButton} aria-label={`Move section ${section.title} up`} disabled={si === 0} onClick={() => updateSections((ss) => moveItem(ss, si, -1))}>
                ↑
              </button>
              <button type="button" className={smallButton} aria-label={`Move section ${section.title} down`} disabled={si === definition.sections.length - 1} onClick={() => updateSections((ss) => moveItem(ss, si, 1))}>
                ↓
              </button>
              <button
                type="button"
                className={`${smallButton} text-red-700 dark:text-red-400`}
                aria-label={`Delete section ${section.title}`}
                disabled={definition.sections.length === 1}
                onClick={() => {
                  if (section.fields.length && !window.confirm(`Delete “${section.title}” and its ${section.fields.length} field(s)?`)) return;
                  updateSections((ss) => ss.filter((s) => s.id !== section.id));
                }}
              >
                Delete
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              {section.fields.map((field, fi) => {
                const fieldIssues = issuesFor(si, fi);
                const open = editing === field.id;
                return (
                  <li key={field.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(open ? null : field.id)}
                        aria-expanded={open}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block font-medium break-words">
                          {field.label || "Untitled field"}
                          {fieldIssues.length ? <span className="ml-2 text-sm text-red-700 dark:text-red-400">needs attention</span> : null}
                        </span>
                        <span className="block text-xs text-stone-600 dark:text-stone-400">
                          {FIELD_TYPE_LABEL[field.type]} · <span className="font-mono">{field.key}</span>
                        </span>
                      </button>
                      <button type="button" className={smallButton} aria-label={`Move ${field.label} up`} disabled={fi === 0} onClick={() => updateSection(section.id, (s) => ({ ...s, fields: moveItem(s.fields, fi, -1) }))}>
                        ↑
                      </button>
                      <button type="button" className={smallButton} aria-label={`Move ${field.label} down`} disabled={fi === section.fields.length - 1} onClick={() => updateSection(section.id, (s) => ({ ...s, fields: moveItem(s.fields, fi, 1) }))}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${smallButton} text-red-700 dark:text-red-400`}
                        aria-label={`Delete ${field.label}`}
                        onClick={() => {
                          if (!window.confirm(`Delete the field “${field.label}”?`)) return;
                          updateSection(section.id, (s) => ({ ...s, fields: s.fields.filter((f) => f.id !== field.id) }));
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    {open ? (
                      <FieldEditor
                        key={field.id}
                        field={field}
                        definition={definition}
                        issues={fieldIssues}
                        onChange={(next) =>
                          updateSection(section.id, (s) => ({ ...s, fields: s.fields.map((f) => (f.id === field.id ? next : f)) }))
                        }
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label htmlFor={`new-type-${section.id}`} className="sr-only">
                Type of new field in {section.title}
              </label>
              <select
                id={`new-type-${section.id}`}
                value={newType[section.id] ?? "number"}
                onChange={(e) => setNewType((t) => ({ ...t, [section.id]: e.target.value as FieldType }))}
                className={`${selectClass} w-auto`}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <button type="button" className={secondaryButtonClass} onClick={() => addField(section)} aria-label={`Add field to ${section.title}`}>
                Add field
              </button>
            </div>
          </Card>
        ))}

        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => updateSections((ss) => [...ss, { id: newId("s"), title: "New section", fields: [] }])}
        >
          Add section
        </button>
      </div>

      <div className="lg:sticky lg:top-4">
        <Card>
          <h2 className="text-lg font-semibold">Live preview</h2>
          <p className="mt-1 mb-4 text-sm text-stone-600 dark:text-stone-400">
            Try values here to test your formulas. They aren’t saved.
          </p>
          <SheetPreview definition={definition} idPrefix="preview" />
        </Card>
      </div>
    </div>
  );
}
