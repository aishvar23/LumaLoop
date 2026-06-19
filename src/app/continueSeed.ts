/**
 * Continue-deck seed helper (Azure DevOps #72).
 *
 * Derive the composition seed's user dimension for an intentional-continue
 * window. The first window (`continueCount === 0`) keeps the plain id so the
 * documented "deterministic per (user, day, mode)" contract is preserved; each
 * subsequent continue suffixes the counter so `composeSession` reshuffles the
 * eligible pool deterministically. The suffix is a SEED ONLY — never a user
 * identity, never persisted.
 *
 * Kept in its own module (not in `SessionRoute.tsx`) so the component file
 * exports only components (react-refresh) and the seed decision stays unit-
 * testable in isolation.
 */
export function continueSeedUserId(
  anonymousUserId: string,
  continueCount: number,
): string {
  return continueCount === 0
    ? anonymousUserId
    : `${anonymousUserId}#continue-${continueCount}`;
}
