import "server-only";
import aliasRows from "./country-aliases.json";
import countryRows from "./countries.json";
import portRows from "./ports.json";

/** [UN/LOCODE, name, lat, lng, alternative names?]. Curated ports come first, so they win ties. */
type Row = [string, string, number, number, string[]?];

export type ResolvedPort = {
  locode: string;
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  countryName: string;
  lat: number;
  lng: number;
};

const countries = countryRows as Record<string, { name: string; num: string | null }>;

const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

const countryByAlias = new Map<string, string>();
for (const [alias, iso2] of Object.entries(aliasRows as Record<string, string>)) countryByAlias.set(norm(alias), iso2);

const byCode = new Map<string, Row>();
const byName = new Map<string, Row[]>();
const byCountry = new Map<string, Row[]>();

const push = <K,>(map: Map<K, Row[]>, key: K, row: Row) => {
  const list = map.get(key);
  if (list) list.push(row);
  else map.set(key, [row]);
};

/** "Port Klang (Pelabuhan Klang)" -> the full text, the text without the brackets, and the bracketed part. */
function nameVariants(name: string) {
  const out = new Set([norm(name), norm(name.replace(/\(.*?\)/g, ""))]);
  for (const m of name.matchAll(/\((.*?)\)/g)) out.add(norm(m[1]));
  out.delete("");
  return out;
}

for (const row of portRows as Row[]) {
  byCode.set(row[0], row);
  push(byCountry, row[0].slice(0, 2), row);
  for (const name of [row[1], ...(row[4] ?? [])]) for (const v of nameVariants(name)) push(byName, v, row);
}

const FILLER = /\b(PORT OF|PORT|SEAPORT|HARBOUR|HARBOR|CONTAINER TERMINAL|TERMINAL|ANCHORAGE|ICD|CFS)\b/g;

function splitQuery(text: string): { name: string; country: string | null } {
  const parts = text.split(/[,;/]|\s-\s/).map((p) => p.trim()).filter(Boolean);
  let country: string | null = null;
  for (let i = parts.length - 1; i >= 1 && !country; i--) country = countryByAlias.get(norm(parts[i])) ?? null;
  if (country || parts.length > 1) return { name: parts[0] ?? "", country };

  // "PORT KLANG MALAYSIA": look for a country in the last one to three words.
  const words = norm(parts[0] ?? "").split(" ");
  for (const k of [3, 2, 1]) {
    if (words.length <= k) continue;
    const found = countryByAlias.get(words.slice(-k).join(" "));
    if (found) return { name: words.slice(0, -k).join(" "), country: found };
  }
  return { name: parts[0] ?? "", country: null };
}

const cache = new Map<string, ResolvedPort | null>();

function toResolved(row: Row): ResolvedPort {
  const iso2 = row[0].slice(0, 2);
  return {
    locode: row[0],
    name: row[1].replace(/\s*\(.*?\)\s*/g, " ").trim(),
    country: iso2,
    countryName: countries[iso2]?.name ?? iso2,
    lat: row[2],
    lng: row[3],
  };
}

/**
 * Turns free text such as "JEBEL ALI, UAE" into coordinates, or null when no port matches.
 * Accepts a UN/LOCODE on its own ("AEJEA"), or a name with an optional country.
 */
export function resolvePort(text: string | null | undefined): ResolvedPort | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  if (cache.has(raw)) return cache.get(raw)!;

  const result = lookup(raw);
  cache.set(raw, result);
  return result;
}

function lookup(raw: string): ResolvedPort | null {
  const code = raw.toUpperCase().replace(/\s/g, "");
  if (/^[A-Z]{2}[A-Z0-9]{3}$/.test(code) && byCode.has(code)) return toResolved(byCode.get(code)!);

  const { name, country } = splitQuery(raw);
  const base = norm(name.replace(/\(.*?\)/g, ""));
  const inBrackets = [...name.matchAll(/\((.*?)\)/g)].map((m) => norm(m[1]));
  const variants = [...new Set([base, base.replace(FILLER, " ").replace(/\s+/g, " ").trim(), ...inBrackets])].filter(Boolean);

  const inCountry = (rows: Row[]) => (country ? rows.filter((r) => r[0].startsWith(country)) : rows);
  for (const v of variants) {
    const match = inCountry(byName.get(v) ?? [])[0];
    if (match) return toResolved(match);
  }
  // A unique name anywhere is still a good match when the stated country is wrong or unknown.
  for (const v of variants) {
    const all = byName.get(v) ?? [];
    if (all.length === 1) return toResolved(all[0]);
  }

  // Last resort inside the stated country: every word of the query appears in a port's name.
  if (country) {
    for (const v of variants) {
      const words = v.split(" ");
      if (v.length < 4) continue;
      const hit = (byCountry.get(country) ?? []).find((r) =>
        [r[1], ...(r[4] ?? [])].some((n) => {
          const nameWords = new Set(norm(n).split(" "));
          return words.every((w) => nameWords.has(w));
        }),
      );
      if (hit) return toResolved(hit);
    }
  }
  return null;
}
