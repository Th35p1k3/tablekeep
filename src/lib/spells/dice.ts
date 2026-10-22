/**
 * Checks dice text like "2d6 + 3", "d20", "1d8 + spell_mod".
 * Allowed pieces: dice (NdM), whole numbers, and short names (a modifier
 * such as "spell_mod" or "WIS"), joined with + or -.
 */
export type DiceCheck =
  | { ok: true; normalized: string; min: number | null; max: number | null; average: number | null }
  | { ok: false; message: string };

const MAX_TERMS = 10;
const TERM = /^(\d*)d(\d+)$|^(\d+)$|^([a-z_][a-z0-9_]{0,29})$/i;

export function checkDice(input: string): DiceCheck {
  const text = input.trim();
  if (!text) return { ok: false, message: "Enter dice, for example 2d6 or 1d8 + 3." };
  if (text.length > 100) return { ok: false, message: "Dice text can be at most 100 characters." };

  const pieces = text.replace(/\s+/g, "").split(/([+-])/).filter((p) => p !== "");
  if (pieces[0] === "+" || pieces[0] === "-") pieces.unshift("0");
  if (pieces.length % 2 === 0) {
    return { ok: false, message: "Dice text can’t end with + or -." };
  }

  let min = 0;
  let max = 0;
  let average = 0;
  let exact = true;
  const parts: string[] = [];
  let terms = 0;

  for (let i = 0; i < pieces.length; i += 2) {
    const sign = i === 0 ? "+" : pieces[i - 1];
    const piece = pieces[i];
    if (piece === "+" || piece === "-") {
      return { ok: false, message: "Two signs in a row. Put a number or dice between them." };
    }
    const m = TERM.exec(piece);
    if (!m) {
      return { ok: false, message: `“${piece}” isn’t dice, a number or a modifier name.` };
    }
    terms++;
    if (terms > MAX_TERMS) return { ok: false, message: `Use at most ${MAX_TERMS} parts.` };

    const s = sign === "-" ? -1 : 1;
    if (m[2] !== undefined) {
      const count = m[1] === "" ? 1 : Number(m[1]);
      const sides = Number(m[2]);
      if (count < 1 || count > 100) return { ok: false, message: "Roll between 1 and 100 dice." };
      if (sides < 2 || sides > 1000) return { ok: false, message: "Dice need between 2 and 1000 sides." };
      const lo = count;
      const hi = count * sides;
      min += s > 0 ? lo : -hi;
      max += s > 0 ? hi : -lo;
      average += (s * (count * (sides + 1))) / 2;
      parts.push(`${sign}${count}d${sides}`);
    } else if (m[3] !== undefined) {
      const n = Number(m[3]);
      if (n > 1000) return { ok: false, message: "Numbers in dice text can be at most 1000." };
      min += s * n;
      max += s * n;
      average += s * n;
      parts.push(`${sign}${n}`);
    } else {
      exact = false;
      parts.push(`${sign}${m[4]}`);
    }
  }

  const normalized = parts
    .join(" ")
    .replace(/^\+/, "")
    .replace(/ \+/g, " + ")
    .replace(/ -/g, " - ")
    .replace(/^0 ([+-]) /, (_all, sign: string) => (sign === "-" ? "-" : ""));
  return exact
    ? { ok: true, normalized, min, max, average: Math.round(average * 10) / 10 }
    : { ok: true, normalized, min: null, max: null, average: null };
}
