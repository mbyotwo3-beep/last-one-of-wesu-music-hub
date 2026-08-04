/**
 * Role checks performed as the signed-in user against `user_roles`.
 *
 * The `is_staff` / `is_superadmin` / `has_role` SQL helpers are SECURITY DEFINER
 * and are no longer executable by `anon` / `authenticated` — they exist purely for
 * RLS policy evaluation. App code reads the caller's own role rows instead, which
 * RLS already scopes to `auth.uid()`.
 */
type RoleClient = {
  from: (table: "user_roles") => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        in: (
          col: string,
          vals: string[],
        ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
};

async function hasAnyRole(client: RoleClient, userId: string, roles: string[]) {
  const { data, error } = await client.from("user_roles").select("role").eq("user_id", userId).in("role", roles);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export function isStaffUser(client: unknown, userId: string) {
  return hasAnyRole(client as RoleClient, userId, ["admin", "superadmin"]);
}

export function isSuperadminUser(client: unknown, userId: string) {
  return hasAnyRole(client as RoleClient, userId, ["superadmin"]);
}
