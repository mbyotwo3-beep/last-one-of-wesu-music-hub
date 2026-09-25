/**
 * The ONE canonical music-category list for Wesu+.
 *
 * Genres used to be free text, so "Gospel", "gospel", "GOSPEL " and
 * "Gospel Music" each rendered as their own browse category. Now:
 * - upload/profile forms offer this list (a select, not a text field),
 * - the server normalizes every genre write through normalizeGenre(),
 * - shelf grouping normalizes too, so legacy variants still merge,
 * - a SQL migration folds existing rows into canonical values.
 */

/** Canonical categories, alphabetical. */
export const MUSIC_GENRES = [
  "Afrobeat",
  "Afro House",
  "Afro Pop",
  "Alternative",
  "Amapiano",
  "Bongo Flava",
  "Choir",
  "Comedy",
  "Country",
  "Dancehall",
  "Drill",
  "EDM",
  "Gospel",
  "Gqom",
  "Highlife",
  "Hip Hop",
  "House",
  "Indie",
  "Jazz",
  "Kalindula",
  "Kizomba",
  "Kwasa Kwasa",
  "Lo-Fi",
  "Pop",
  "R&B",
  "Reggae",
  "Rhumba",
  "Rock",
  "Soul",
  "Spoken Word",
  "Traditional",
  "Trap",
  "Worship",
  "Zamrock",
] as const;

export type MusicGenre = (typeof MUSIC_GENRES)[number];

/** Lowercase key (single-spaced) → canonical value. */
const CANONICAL_BY_KEY = new Map<string, string>(
  MUSIC_GENRES.map((g) => [g.toLowerCase(), g]),
);

/** Common aliases → canonical value (all lowercase, single-spaced keys). */
const GENRE_ALIASES: Record<string, string> = {
  "afro beat": "Afrobeat",
  afrobeats: "Afrobeat",
  "afro beats": "Afrobeat",
  "afro house": "Afro House",
  afrohouse: "Afro House",
  "afro-house": "Afro House",
  "afro pop": "Afro Pop",
  afropop: "Afro Pop",
  "afro-pop": "Afro Pop",
  alternative: "Alternative",
  alt: "Alternative",
  "bongo flava": "Bongo Flava",
  bongoflava: "Bongo Flava",
  electronic: "EDM",
  lofi: "Lo-Fi",
  "gospel music": "Gospel",
  gospels: "Gospel",
  "hiphop": "Hip Hop",
  "hip-hop": "Hip Hop",
  rap: "Hip Hop",
  "r n b": "R&B",
  "r&b": "R&B",
  rnb: "R&B",
  "rhythm and blues": "R&B",
  "kwasa-kwasa": "Kwasa Kwasa",
  kwasakwasa: "Kwasa Kwasa",
  "kwassa kwassa": "Kwasa Kwasa",
  rumba: "Rhumba",
  kalindula: "Kalindula",
  amapiano: "Amapiano",
  "ama piano": "Amapiano",
  dancehall: "Dancehall",
  "dance hall": "Dancehall",
  "spokenword": "Spoken Word",
  "spoken-word": "Spoken Word",
  trad: "Traditional",
  traditional: "Traditional",
  worship: "Worship",
  choir: "Choir",
  choirs: "Choir",
};

function squish(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

/**
 * Fold any genre input into its canonical category. Unknown values come
 * back trimmed (never destroyed) — the UI constrains input to the list,
 * so this is only a safety net for direct API/DB writes.
 */
export function normalizeGenre(input: string | null | undefined): string {
  if (!input) return "";
  const key = squish(input).toLowerCase();
  if (!key) return "";
  return CANONICAL_BY_KEY.get(key) ?? GENRE_ALIASES[key] ?? squish(input);
}

/** True when the value is one of the canonical categories. */
export function isCanonicalGenre(input: string | null | undefined): boolean {
  if (!input) return false;
  return CANONICAL_BY_KEY.has(squish(input).toLowerCase());
}
