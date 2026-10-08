/**
 * How a song's artist line is written — the Spotify rule.
 *
 * The app had exactly one way to add a second artist: `role: 'featured'`. So a
 * song where two artists genuinely made it together was displayed as
 * "A feat. B", which is simply wrong: nobody featured anybody. The database
 * already carried a `main` role for a co-lead credit; nothing in the app ever
 * set it or rendered it.
 *
 * Three genuinely different relationships, kept distinct:
 *
 *   co-lead  ("main")   Both artists made the song together. Displayed
 *                        "A & B" as THE artist. No "feat." anywhere.
 *   featured            One artist leads, another comes in on their song.
 *                        Displayed "A" as the artist plus "(feat. B)".
 *   credit              producer / writer / remixer. Never in the artist line
 *                        at all — shown in the credits block only, because
 *                        writing a song is not performing on it.
 */

export type CreditRole = "main" | "featured" | "producer" | "writer" | "remixer";

/** Roles that belong in the artist line (they performed on the track). */
export const PERFORMER_ROLES: CreditRole[] = ["main", "featured"];

/** Roles that are credits only, never the artist line. */
export const CREDIT_ONLY_ROLES: CreditRole[] = ["producer", "writer", "remixer"];

export function isPerformer(role: string): boolean {
  return (PERFORMER_ROLES as string[]).includes(role);
}

export function isCreditOnly(role: string): boolean {
  return (CREDIT_ONLY_ROLES as string[]).includes(role);
}

/** Label shown beside a credit-only name. */
export function creditLabel(role: string): string {
  switch (role) {
    case "producer":
      return "Producer";
    case "writer":
      return "Writer";
    case "remixer":
      return "Remixer";
    default:
      return "Credits";
  }
}

/** Short human label for a performer role. */
export function performerLabel(role: string): string {
  return role === "main" ? "Co-lead artist" : "Featured artist";
}

/**
 * Build the artist line.
 *
 *   co-leads + no features  -> "A & B"
 *   co-leads + a feature    -> "A & B"  (the feature is separate, below)
 *   lead + features         -> "A"
 *
 * `leadName` is the song's owning artist. Returns an empty string when there is
 * nothing to show, so callers must not render a stray separator.
 */
export function formatArtistLine(
  leadName: string | null | undefined,
  credits: { name: string; role: string }[] = [],
): string {
  const lead = (leadName ?? "").trim();
  const coLeads = credits.filter((c) => c.role === "main");
  const parts = [lead, ...coLeads.map((c) => c.name.trim())].filter(Boolean);
  return parts.join(" & ");
}

/** The "(feat. A & B)" suffix. Empty when there are no featured artists. */
export function formatFeatureSuffix(credits: { name: string; role: string }[]): string {
  const featured = credits
    .filter((c) => c.role === "featured")
    .map((c) => c.name.trim())
    .filter(Boolean);
  if (!featured.length) return "";
  return `(feat. ${featured.join(" & ")})`;
}

/**
 * True when the other artist still needs an account.
 *
 * Without one they get no link to their page and no share of the earnings, so
 * every credited collaborator who has not registered is an invitation to send.
 */
export function needsAccount(credit: { artistId?: string | null }): boolean {
  return !credit.artistId;
}

/** The nudge text, per relationship. */
export function accountNudge(role: string): string {
  switch (role) {
    case "main":
      return "This artist has no account yet, so they don't get credit or a share of the earnings. Send them your registration link so they can claim this song.";
    case "featured":
      return "This artist has no account yet, so they don't get credit or a share of the earnings. Send them your registration link so they can claim their feature.";
    default:
      return "This person has no account, so their credit is a name only. That's fine for a writing or production credit.";
  }
}
