/**
 * Server-side guard for platform_settings writes (superadmin Settings tab).
 * One typo'd URL or negative price cap here breaks payments, invites, or
 * uploads globally — so updateSettings rejects bad values with a message
 * instead of persisting them. Pure and unit-tested.
 *
 * Returns an error message when invalid, null when the value is safe to store.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function validHttpUrl(v: unknown): boolean {
  if (typeof v !== "string" || !v.trim()) return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkRange(
  v: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): string | null {
  if (v[field] === undefined) return null;
  const n = num(v[field]);
  if (n === null || n < min || n > max) {
    return `${field} must be a number between ${min} and ${max}`;
  }
  return null;
}

export function validateSettingsValue(key: string, value: unknown): string | null {
  if (!isPlainObject(value)) return "Settings value must be an object";
  switch (key) {
    case "site": {
      if (value.url !== undefined && !validHttpUrl(value.url)) {
        return "Site URL must be a valid http(s) address (e.g. https://www.wesuplusly.com)";
      }
      const commission = checkRange(value, "commission_pct", 0, 100);
      if (commission) return commission;
      for (const f of ["mobile_app_url", "ios_app_url"] as const) {
        const raw = value[f];
        if (raw !== undefined && raw !== null && String(raw).trim() !== "" && !validHttpUrl(raw)) {
          return `${f} must be a valid http(s) address or left blank`;
        }
      }
      if (
        value.support_email !== undefined &&
        String(value.support_email ?? "").trim() !== "" &&
        !EMAIL_RE.test(String(value.support_email))
      ) {
        return "Support email doesn't look like an email address";
      }
      return null;
    }
    case "pricing": {
      for (const f of [
        "song_min",
        "song_max",
        "album_min",
        "album_max",
        "free_song_fee",
      ] as const) {
        const err = checkRange(value, f, 0, 1_000_000);
        if (err) return err;
      }
      const sMin = num(value.song_min);
      const sMax = num(value.song_max);
      if (sMin !== null && sMax !== null && sMin > sMax) {
        return "Song min price cannot be higher than song max price";
      }
      const aMin = num(value.album_min);
      const aMax = num(value.album_max);
      if (aMin !== null && aMax !== null && aMin > aMax) {
        return "Album min price cannot be higher than album max price";
      }
      return null;
    }
    case "withdrawal": {
      return checkRange(value, "min_amount", 0, 1_000_000_000);
    }
    case "verification": {
      for (const f of ["min_followers", "min_earnings"] as const) {
        const err = checkRange(value, f, 0, 1_000_000_000);
        if (err) return err;
      }
      return null;
    }
    case "payments": {
      if (
        value.lenco_mode !== undefined &&
        value.lenco_mode !== "sandbox" &&
        value.lenco_mode !== "live"
      ) {
        return 'Lenco mode must be "sandbox" or "live"';
      }
      return null;
    }
    default:
      return `Unknown settings key "${key}" — refusing to store it`;
  }
}

/** Platform commission percent shared by the settings form and payouts. */
export function validateCommissionPct(pct: unknown): string | null {
  const n = num(pct);
  if (n === null || n < 0 || n > 100) {
    return "Commission must be a number between 0 and 100";
  }
  return null;
}
