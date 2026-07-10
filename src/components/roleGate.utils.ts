/**
 * Pure utility functions for RoleGate access control logic.
 * Extracted so they can be unit-tested without React/hook dependencies.
 *
 * Feature: wesu-plus-completion
 */

export type AppRole = "user" | "artist" | "admin" | "superadmin";

export type AccessResult = "allowed" | "redirect-auth" | "redirect-home";

/**
 * Determine whether a user has the access required by a RoleGate.
 *
 * Returns:
 *  - 'allowed'       — user has sufficient role, render children
 *  - 'redirect-auth' — user is not authenticated at all, navigate to /auth
 *  - 'redirect-home' — user is authenticated but lacks the required role,
 *                      navigate to / with toast
 */
export function checkRoleAccess(opts: {
  require: AppRole;
  isUser: boolean;
  isArtist: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}): AccessResult {
  const { require, isUser, isArtist, isAdmin, isSuperAdmin } = opts;

  if (!isUser) return "redirect-auth";

  const ok =
    require === "user"
      ? isUser
      : require === "artist"
        ? isArtist || isAdmin || isSuperAdmin
        : require === "admin"
          ? isAdmin || isSuperAdmin
          : require === "superadmin"
            ? isSuperAdmin
            : false;

  return ok ? "allowed" : "redirect-home";
}
