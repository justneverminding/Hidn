/**
 * Shared product vocabulary only.
 *
 * This package deliberately contains no identity, persistence, or tracking
 * primitives in Phase 0.
 */
export const HIDN_PRODUCT_NAME = "HIDN" as const;
export const HIDN_PRODUCT_CONCEPT = "Anonymous Internet Noir" as const;

export type HidnSurface = "web" | "admin" | "api";

