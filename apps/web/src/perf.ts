/** Device budget. Phones and modest hardware get "lite" mode: the same
 * look with cheaper rendering, so the museum and terminal effects stay
 * smooth and do not drain the battery. */

interface NavigatorHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
}

function detectLite(): boolean {
  try {
    const nav = navigator as Navigator & NavigatorHints;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fewCores = (nav.hardwareConcurrency ?? 8) <= 4;
    const lowMemory = (nav.deviceMemory ?? 8) <= 4;
    const saveData = Boolean(nav.connection?.saveData);
    const forced = new URLSearchParams(window.location.search).get("perf");
    if (forced === "full") return false;
    if (forced === "lite") return true;
    return coarse || reduced || fewCores || lowMemory || saveData;
  } catch {
    return false;
  }
}

export const LITE = detectLite();

export function applyPerformanceMode(): void {
  document.documentElement.dataset.perf = LITE ? "lite" : "full";
}
