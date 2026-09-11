import { COMPARE_KEY } from "./compare";

/**
 * The comparison selection as an external store, read with
 * `useSyncExternalStore`.
 *
 * The obvious shape — `useState` plus an effect that reads localStorage on
 * mount — trips React's own lint rule (setState inside an effect body causes a
 * cascading render) and hydrates the wrong tree for one frame. A store solves
 * both: the server snapshot is a stable empty array, the client snapshot is
 * read straight from localStorage during render, and subscribing to the
 * `storage` event keeps two open tabs in agreement for free.
 *
 * `getSnapshot` must return the *same reference* while nothing has changed, or
 * React re-renders forever — hence the cache.
 */

const EMPTY: string[] = [];

let cache: string[] = EMPTY;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(COMPARE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

export function subscribeCompare(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === COMPARE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const getCompareSnapshot = read;
export const getCompareServerSnapshot = () => EMPTY;

/**
 * Re-read storage and notify if it moved. Called once after mount.
 *
 * `useSyncExternalStore` is supposed to swap the server snapshot for the
 * client one on its own after hydration, and in this app it does not — a
 * selection restored from a previous session stayed invisible until the next
 * interaction. Every other transition arrives through `writeCompare`, which
 * notifies explicitly; this closes the one gap that relied on React noticing
 * by itself.
 */
export function syncCompareFromStorage() {
  const before = cacheRaw;
  read();
  if (cacheRaw !== before) for (const listener of listeners) listener();
}

export function writeCompare(ids: string[]) {
  try {
    window.localStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode: keep the in-memory value so this page view still works.
    cacheRaw = JSON.stringify(ids);
    cache = ids;
  }
  // `storage` does not fire in the tab that wrote, so notify directly.
  for (const listener of listeners) listener();
}
