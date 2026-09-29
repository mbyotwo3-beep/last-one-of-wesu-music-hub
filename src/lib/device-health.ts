/**
 * Per-manufacturer instructions for the two things that silently kill music
 * playback in the background on Android phones: battery optimisation and the
 * vendor "autostart" kill-switch. Both live in vendor Settings screens that no
 * app may change for the user — the only honest fix is to explain the exact
 * taps, per brand. Pure functions (unit-tested), no platform calls.
 */

export interface BatteryGuidance {
  /** Short name of the brand family, for the headline. */
  family: string;
  /** Ordered taps. Each line is one screen. */
  steps: string[];
}

const DEFAULT_GUIDANCE: BatteryGuidance = {
  family: "Android",
  steps: [
    "Settings → Apps → Wesu+ → Battery → set it to Unrestricted / No restrictions.",
    "Settings → Battery → App battery management → Wesu+ → Unrestricted.",
  ],
};

const GUIDANCE: Array<{ match: string[]; guidance: BatteryGuidance }> = [
  {
    match: ["xiaomi", "redmi", "poco", "black shark"],
    guidance: {
      family: "Xiaomi",
      steps: [
        "Tap “Allow” on the battery-optimisation prompt (or: Settings → Apps → Manage apps → Wesu+ → Ignore battery optimisations → Allow).",
        "Same screen → Autostart → turn it ON.",
        "Settings → Battery saver → App battery saver → Wesu+ → No restrictions.",
      ],
    },
  },
  {
    match: ["oppo", "realme", "oneplus"],
    guidance: {
      family: "Oppo",
      steps: [
        "Tap “Allow” on the battery-optimisation prompt.",
        "Settings → Battery → App battery usage → Wesu+ → Unrestricted, and allow Background activity.",
        "Settings → Additional settings → Autostart → Wesu+ → enable (and allow it to run in the background).",
      ],
    },
  },
  {
    match: ["vivo", "iqoo"],
    guidance: {
      family: "Vivo",
      steps: [
        "Tap “Allow” on the battery-optimisation prompt.",
        "Settings → Battery → High background power consumption → allow Wesu+.",
        "Settings → Apps → Permissions → Autostart → enable Wesu+.",
      ],
    },
  },
  {
    match: ["tecno", "infinix", "itel", "transsion"],
    guidance: {
      family: "Transsion",
      steps: [
        "Tap “Allow” on the battery-optimisation prompt.",
        "Settings → Battery → Battery manager → App management → Wesu+ → Autostart ON, and set it to “Unrestricted”.",
        "Settings → Apps → Autostart → make sure Wesu+ is listed as Allowed.",
      ],
    },
  },
  {
    match: ["samsung"],
    guidance: {
      family: "Samsung",
      steps: [
        "Tap “Allow” on the battery-optimisation prompt (Settings → Battery → Background usage limits → Never sleeping apps → add Wesu+).",
        "Settings → Apps → Wesu+ → Battery → Unrestricted.",
        "Settings → Notifications → Wesu+ → make sure notifications are ON (needed for the lock-screen player).",
      ],
    },
  },
  {
    match: ["huawei", "honor"],
    guidance: {
      family: "Huawei",
      steps: [
        "Tap “Allow” on the battery-optimisation prompt (Settings → Battery → App launch → Wesu+ → Manage manually → all three switches on).",
        "Settings → Battery → App launch → Wesu+ → Secondary launch / Auto-launch on.",
      ],
    },
  },
];

/**
 * Vendor-specific taps for keeping Wesu+ alive in the background. Unknown
 * brands get the plain Android path (never a wrong, brand-specific answer).
 */
export function batteryGuidance(brand: string | null | undefined): BatteryGuidance {
  const raw = String(brand ?? "").toLowerCase();
  if (!raw) return DEFAULT_GUIDANCE;
  for (const entry of GUIDANCE) {
    if (entry.match.some((m) => raw.includes(m))) return entry.guidance;
  }
  return DEFAULT_GUIDANCE;
}

/** Unknown brand → the generic wording, so the copy never lies about the phone. */
export function isKnownBrand(brand: string | null | undefined): boolean {
  return batteryGuidance(brand).family !== "Android";
}

export const DEFAULT_BATTERY_GUIDANCE = DEFAULT_GUIDANCE;
