/**
 * Offline profile persistence using @capacitor/preferences.
 * Caches the user profile and subscription status to device storage
 * so the profile screen shows meaningful data even when offline.
 *
 * Feature: wesu-plus-completion
 * Validates: Requirements 17.5
 */

export interface CachedProfile {
  full_name: string;
  bio: string;
  avatar_url: string;
  location: string;
  email: string;
}

/**
 * Persist the user profile to device preferences.
 * Falls back silently when @capacitor/preferences is unavailable (web).
 */
export async function cacheProfile(profile: CachedProfile): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({
      key: "cached_profile",
      value: JSON.stringify(profile),
    });
  } catch {
    // Plugin unavailable on web — silently ignore
  }
}

/**
 * Retrieve the cached user profile from device preferences.
 * Returns null when no cache exists or the plugin is unavailable.
 */
export async function getCachedProfile(): Promise<CachedProfile | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: "cached_profile" });
    if (!value) return null;
    return JSON.parse(value) as CachedProfile;
  } catch {
    return null;
  }
}

/**
 * Clear the cached profile from device preferences.
 */
export async function clearCachedProfile(): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: "cached_profile" });
  } catch {
    // Silently ignore
  }
}
