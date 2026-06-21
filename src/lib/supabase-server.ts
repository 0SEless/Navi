import { createSupabaseContext } from "@supabase/server"
import type { AuthModeWithKey } from "@supabase/server"

export async function getSupabaseContext(
  request: Request,
  auth: AuthModeWithKey | AuthModeWithKey[] = "secret",
) {
  const { data: ctx, error } = await createSupabaseContext(request, { auth })
  if (error) throw error
  return ctx
}
