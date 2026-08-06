"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { products } from "@/lib/catalog";
import { MAX_COMPARE, scopeOf } from "@/lib/compare";
import {
  getCompareServerSnapshot,
  getCompareSnapshot,
  subscribeCompare,
  syncCompareFromStorage,
  writeCompare,
} from "@/lib/compare-store";
import { installComparePairsHelper } from "@/lib/compare-pairs";
import type { Product } from "@/lib/types";

type PendingSwitch = { product: Product; fromScope: string };

type CompareContext = {
  ids: string[];
  items: Product[];
  scope: string | null;
  isSelected: (id: string) => boolean;
  /** true when the cap is reached and `id` is not already selected */
  isBlocked: (id: string) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** set when a pick from another category needs the user to decide */
  pending: PendingSwitch | null;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
};

const Ctx = createContext<CompareContext | null>(null);

/**
 * Selection state for the comparison feature.
 *
 * Mounted above the router so the selection survives navigation between the
 * catalog and a product page, and backed by localStorage so it survives a
 * reload. Only ids are stored; products are resolved from the catalog on read,
 * so an id left over from an older build quietly disappears instead of
 * rendering a broken row.
 */
export default function CompareProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const ids = useSyncExternalStore(
    subscribeCompare,
    getCompareSnapshot,
    getCompareServerSnapshot,
  );
  const [pending, setPending] = useState<PendingSwitch | null>(null);

  // One-shot: adopt whatever storage already held when the page loaded, and
  // expose the comparison log for inspection from the console.
  useEffect(() => {
    syncCompareFromStorage();
    installComparePairsHelper();
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), []);

  const items = useMemo(
    () => ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p)),
    [ids, byId],
  );
  const scope = items.length ? scopeOf(items[0]) : null;

  const toggle = useCallback(
    (id: string) => {
      const product = byId.get(id);
      if (!product) return;

      if (ids.includes(id)) {
        writeCompare(ids.filter((x) => x !== id));
        return;
      }
      // A pick from another category would silently invalidate the whole
      // comparison, so it asks rather than acting.
      if (scope && scopeOf(product) !== scope) {
        setPending({ product, fromScope: scope });
        return;
      }
      if (ids.length >= MAX_COMPARE) return;
      writeCompare([...ids, id]);
    },
    [byId, ids, scope],
  );

  const value = useMemo<CompareContext>(
    () => ({
      ids,
      items,
      scope,
      pending,
      isSelected: (id) => ids.includes(id),
      // The cap only blocks products that would *join* the current list. One
      // from another category replaces it wholesale, so it is never blocked —
      // it asks. Without this distinction a full selection made every
      // cross-category control look permanently dead.
      isBlocked: (id) => {
        if (ids.includes(id) || ids.length < MAX_COMPARE) return false;
        const product = byId.get(id);
        return !product || !scope || scopeOf(product) === scope;
      },
      toggle,
      remove: (id) => writeCompare(ids.filter((x) => x !== id)),
      clear: () => writeCompare([]),
      confirmSwitch: () => {
        if (pending) writeCompare([pending.product.id]);
        setPending(null);
      },
      cancelSwitch: () => setPending(null),
    }),
    [ids, items, scope, pending, toggle, byId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompare(): CompareContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCompare must be used inside <CompareProvider>");
  return ctx;
}
