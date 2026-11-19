/**
 * No-op session helper. The previous implementation contained hidden
 * calls to a third-party endpoint and forced redirects. Removed for
 * security reasons.
 */
export async function refreshSession() {
  // intentionally empty
}
