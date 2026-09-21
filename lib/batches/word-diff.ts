// Highlighting for the SI/BL comparison table. UI-only: turns two already-matched
// field values into the marked-up segments the table renders — it never decides
// match/mismatch itself (that comes from the data layer's `FieldComparison.match`).

export type DiffSegment = { text: string; differs: boolean };

/** Longest-common-subsequence word diff, so one inserted/removed/reordered word
 * doesn't mark everything after it as different. Ported from the reference
 * implementation in docs/sky-ui-revamp/index.html. */
export function wordDiff(a: string, b: string): { si: DiffSegment[]; bl: DiffSegment[] } {
  const A = a.split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/).filter(Boolean);
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const si: DiffSegment[] = [];
  const bl: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      si.push({ text: A[i], differs: false });
      bl.push({ text: B[j], differs: false });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      si.push({ text: A[i++], differs: true });
    } else {
      bl.push({ text: B[j++], differs: true });
    }
  }
  while (i < n) si.push({ text: A[i++], differs: true });
  while (j < m) bl.push({ text: B[j++], differs: true });

  return { si, bl };
}

/** Formats a field value for display: numbers get thousands separators, null/""
 * becomes "" (the table renders that as an em dash). */
export function displayValue(v: string | number | null): string {
  if (v === null) return "";
  return typeof v === "number" ? v.toLocaleString("en-US") : v;
}

/**
 * Builds the highlighted segments for a mismatched field's SI/BL cells.
 * - Multi-word text: word-level LCS diff, only differing words marked.
 * - Numbers and single-word values: the whole value is marked (nothing to
 *   diff word-by-word).
 * - When one side is empty, everything on the non-empty side is marked (there's
 *   nothing on the other side to match against) and the empty side renders as
 *   an em dash in the table.
 * Only meaningful for a field where `match` is false; matching fields render
 * plain text.
 */
export function diffField(si: string | number | null, bl: string | number | null): { si: DiffSegment[]; bl: DiffSegment[] } {
  const siText = displayValue(si);
  const blText = displayValue(bl);
  const multiWord = /\s/.test(siText.trim()) || /\s/.test(blText.trim());

  if (multiWord) return wordDiff(siText, blText);

  return {
    si: siText ? [{ text: siText, differs: true }] : [],
    bl: blText ? [{ text: blText, differs: true }] : [],
  };
}
