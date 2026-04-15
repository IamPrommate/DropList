/** Values match `users.plan` in Postgres and JSON API payloads. */
export enum UserPlan {
  Free = 'free',
  Pro = 'pro',
}

/** Normalize DB / session / unknown JSON to `UserPlan`. */
export function parseUserPlan(value: unknown): UserPlan {
  if (value === UserPlan.Pro || value === 'pro') return UserPlan.Pro;
  return UserPlan.Free;
}
