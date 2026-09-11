"use client";

import { categoryLabel, subcategoryLabel } from "@/lib/catalog";
import type { FilterUpdate, Filters } from "@/lib/filters";
import { activeFilterCount, removeSpecValue } from "@/lib/filters";
import { formatPrice } from "@/lib/format";

type Chip = { id: string; label: string; patch: FilterUpdate };

export default function ActiveChips({
  filters,
  onChange,
  onClearAll,
}: {
  filters: Filters;
  onChange: (patch: FilterUpdate) => void;
  onClearAll: () => void;
}) {
  if (activeFilterCount(filters) === 0) return null;

  const chips: Chip[] = [];

  if (filters.q) {
    chips.push({ id: "q", label: `ძებნა: “${filters.q}”`, patch: { q: "" } });
  }

  if (filters.category) {
    chips.push({
      id: `cat:${filters.category}`,
      label: categoryLabel(filters.category),
      patch: { category: null, subcategories: [], specs: {} },
    });

    for (const sub of filters.subcategories) {
      chips.push({
        id: `sub:${sub}`,
        label: subcategoryLabel(filters.category, sub),
        // Function form: removals must compose if two chips are dismissed
        // in the same tick.
        patch: (prev) => ({
          subcategories: prev.subcategories.filter((s) => s !== sub),
        }),
      });
    }
  }

  for (const brand of filters.brands) {
    chips.push({
      id: `brand:${brand}`,
      label: brand,
      patch: (prev) => ({ brands: prev.brands.filter((b) => b !== brand) }),
    });
  }

  if (filters.min !== null || filters.max !== null) {
    const label =
      filters.min !== null && filters.max !== null
        ? `${formatPrice(filters.min)} – ${formatPrice(filters.max)}`
        : filters.min !== null
          ? `${formatPrice(filters.min)}-დან`
          : `${formatPrice(filters.max!)}-მდე`;
    chips.push({ id: "price", label, patch: { min: null, max: null } });
  }

  for (const [key, values] of Object.entries(filters.specs)) {
    for (const value of values) {
      chips.push({
        id: `spec:${key}:${value}`,
        label: `${key}: ${value}`,
        patch: (prev) => ({ specs: removeSpecValue(prev, key, value).specs }),
      });
    }
  }

  if (filters.inStockOnly) {
    chips.push({
      id: "stock",
      label: "მარაგშია",
      patch: { inStockOnly: false },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.patch)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-alta-200 bg-white py-1.5 pl-3 pr-2 text-xs font-medium text-alta-800 transition hover:border-alta-purple hover:bg-alta-50 hover:text-alta-purple"
        >
          {chip.label}
          <span
            aria-hidden
            className="grid size-4 place-items-center rounded-full bg-alta-100 text-[10px] leading-none text-alta-700 transition group-hover:bg-alta-purple group-hover:text-white"
          >
            ✕
          </span>
          <span className="sr-only">ფილტრის მოხსნა</span>
        </button>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="rounded-full px-2.5 py-1.5 text-xs font-bold text-alta-crimson underline-offset-2 hover:underline"
      >
        ყველას გასუფთავება
      </button>
    </div>
  );
}
