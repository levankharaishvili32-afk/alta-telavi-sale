"use client";

import { categories, getCategory, hasSpecFilters } from "@/lib/catalog";
import type { Facets, FilterUpdate, Filters } from "@/lib/filters";
import { activeFilterCount } from "@/lib/filters";
import PriceRange from "./PriceRange";

type Props = {
  filters: Filters;
  facets: Facets;
  onChange: (patch: FilterUpdate) => void;
  onClearAll: () => void;
  /** false inside the mobile drawer, which supplies its own header */
  showHeading?: boolean;
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-alta-100 py-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-alta-purple-deep">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm transition hover:bg-alta-50 ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 shrink-0 rounded-[3px] border-alta-300 accent-[#652d8f] focus:ring-alta-purple"
      />
      <span className="flex-1 text-alta-800">{label}</span>
      {count !== undefined && (
        <span className="tabular-nums text-xs text-alta-400">{count}</span>
      )}
    </label>
  );
}

export default function FilterPanel({
  filters,
  facets,
  onChange,
  onClearAll,
  showHeading = true,
}: Props) {
  const activeCategory = getCategory(filters.category);
  const count = activeFilterCount(filters);

  return (
    <div>
      {(showHeading || count > 0) && (
        <div className="flex items-center justify-between pb-4">
          {showHeading ? (
            <h2 className="text-base font-bold text-alta-purple-deep">ფილტრები</h2>
          ) : (
            <span className="text-xs font-medium text-alta-400">
              აქტიური: {count}
            </span>
          )}
          {count > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs font-semibold text-alta-crimson underline-offset-2 hover:underline"
            >
              გასუფთავება ({count})
            </button>
          )}
        </div>
      )}

      <Section title="კატეგორია">
        <div className="space-y-0.5">
          {categories.map((cat) => {
            const isActive = filters.category === cat.id;
            const n = facets.categories[cat.id] ?? 0;
            return (
              <div key={cat.id}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() =>
                    onChange({
                      category: isActive ? null : cat.id,
                      subcategories: [],
                      specs: {},
                    })
                  }
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                    isActive
                      ? "bg-alta-50 font-semibold text-alta-purple"
                      : "text-alta-800 hover:bg-alta-50"
                  } ${n === 0 && !isActive ? "opacity-40" : ""}`}
                >
                  <span className="flex-1">{cat.label}</span>
                  <span className="tabular-nums text-xs text-alta-400">
                    {n}
                  </span>
                </button>

                {isActive && cat.subcategories.length > 0 && (
                  <div className="mb-1 ml-3 border-l-2 border-alta-100 pl-2">
                    {cat.subcategories.map((sub) => (
                      <CheckRow
                        key={sub.id}
                        label={sub.label}
                        count={facets.subcategories[sub.id] ?? 0}
                        checked={filters.subcategories.includes(sub.id)}
                        onChange={() =>
                          onChange((prev) => ({
                            subcategories: toggle(prev.subcategories, sub.id),
                          }))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="ფასი (ფასდაკლებული)">
        <PriceRange
          bounds={facets.priceBounds}
          value={{ min: filters.min, max: filters.max }}
          onCommit={(min, max) => onChange({ min, max })}
        />
      </Section>

      {facets.brands.length > 1 && (
        <Section title="ბრენდი">
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {facets.brands.map((b) => (
              <CheckRow
                key={b.value}
                label={b.value}
                count={b.count}
                checked={filters.brands.includes(b.value)}
                onChange={() =>
                  onChange((prev) => ({ brands: toggle(prev.brands, b.value) }))
                }
              />
            ))}
          </div>
        </Section>
      )}

      {activeCategory &&
        facets.specs.map((facet) => (
          <Section key={facet.key} title={facet.key}>
            <div className="space-y-0.5">
              {facet.options.map((opt) => {
                const selected = (filters.specs[facet.key] ?? []).includes(
                  opt.value,
                );
                return (
                  <CheckRow
                    key={opt.value}
                    label={opt.value}
                    count={opt.count}
                    checked={selected}
                    onChange={() =>
                      onChange((prev) => {
                        const nextValues = toggle(
                          prev.specs[facet.key] ?? [],
                          opt.value,
                        );
                        const specs = { ...prev.specs };
                        if (nextValues.length) specs[facet.key] = nextValues;
                        else delete specs[facet.key];
                        return { specs };
                      })
                    }
                  />
                );
              })}
            </div>
          </Section>
        ))}

      {!activeCategory && hasSpecFilters && (
        <div className="border-t border-alta-100 py-5">
          <p className="alta-corners bg-alta-50 px-3 py-2.5 text-xs leading-relaxed text-alta-700">
            აირჩიეთ კატეგორია, რომ გამოჩნდეს დამატებითი მახასიათებლების
            ფილტრები.
          </p>
        </div>
      )}

      <Section title="ხელმისაწვდომობა">
        <CheckRow
          label="მხოლოდ მარაგში არსებული"
          checked={filters.inStockOnly}
          onChange={() =>
            onChange((prev) => ({ inStockOnly: !prev.inStockOnly }))
          }
        />
      </Section>
    </div>
  );
}
