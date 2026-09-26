/**
 * Privacy package boundary.
 *
 * Real privacy protocols and data-flow code are intentionally deferred to a
 * later milestone. Keeping the boundary now prevents future product code
 * from importing ad-hoc identity or telemetry helpers.
 */
export const PRIVACY_IMPLEMENTATION_STATUS = "reserved-for-later-milestone" as const;

