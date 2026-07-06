import type { User } from "@supabase/supabase-js";

export function isDurableUser(user: User | null): user is User {
  return Boolean(user && user.is_anonymous !== true && user.email);
}
