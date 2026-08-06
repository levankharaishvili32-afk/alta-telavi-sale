"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ProductImage from "./ProductImage";
import ComparePicker from "./ComparePicker";
import { useCompare } from "./CompareProvider";
import {
  MAX_COMPARE,
  MIN_COMPARE,
  compareHref,
  scopeLabel,
} from "@/lib/compare";

/**
 * The persistent selection bar. Appears as soon as one product is picked and
 * stays across navigation, since the provider lives above the router.
 *
 * Hidden on /compare itself: the comparison page already shows every selected
 * product as a column with its own remove control, and a duplicate strip at
 * the bottom of the screen would just cover the table.
 */
export default function CompareBar() {
  const {
    items,
    scope,
    remove,
    clear,
    toggle,
    pending,
    confirmSwitch,
    cancelSwitch,
  } = useCompare();
  const [picking, setPicking] = useState(false);
  const pathname = usePathname();

  /*
   * Publish the bar's measured height as `--compare-bar-h` so anything else
   * anchored to the bottom of the screen — the Messenger button — can sit
   * above it. Measured rather than hardcoded because the bar stacks on a
   * phone, so its height is not a constant.
   */
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = barRef.current;
    const root = document.documentElement;
    if (!node) {
      root.style.setProperty("--compare-bar-h", "0px");
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty(
        "--compare-bar-h",
        `${Math.round(entry.contentRect.height)}px`,
      );
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.setProperty("--compare-bar-h", "0px");
    };
  });

  if (pathname === "/compare" && !pending) return null;
  if (!items.length && !pending) return null;

  const enough = items.length >= MIN_COMPARE;

  return (
    <>
      {pending && (
        <SwitchPrompt
          fromLabel={scopeLabel(pending.fromScope)}
          count={items.length}
          onConfirm={confirmSwitch}
          onCancel={cancelSwitch}
        />
      )}

      {items.length > 0 && (
        <>
          {/* Reserves the height the fixed bar occupies, plus a little, so the
              footer clears it instead of ending flush against its top edge. */}
          <div aria-hidden className="h-28 sm:h-24" />
          <div
            ref={barRef}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-alta-100 bg-white/95 shadow-[0_-8px_24px_-12px_rgb(61_41_86_/_0.3)] backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 lg:px-8">
              <p className="shrink-0 text-xs font-medium text-alta-400 sm:hidden">
                შედარება · {scope ? scopeLabel(scope) : ""}
              </p>

              <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
                {items.map((product) => (
                  <li key={product.id} className="relative shrink-0">
                    <Link
                      href={`/product/${product.id}`}
                      className="alta-corners block size-14 overflow-hidden border border-alta-100 bg-white"
                      title={product.title}
                    >
                      <span className="relative block size-full">
                        <ProductImage
                          src={product.image}
                          alt={product.title}
                          sizes="56px"
                          className="object-contain p-1"
                        />
                      </span>
                    </Link>
                    {/* Inside the tile, not hanging off it: the list scrolls
                      horizontally, and `overflow-x` clips the vertical axis
                      too, which decapitated a badge sitting at -top-1.5. */}
                    <button
                      type="button"
                      onClick={() => remove(product.id)}
                      aria-label={`${product.title} — შედარებიდან ამოღება`}
                      className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-alta-purple-deep/90 text-white transition hover:bg-alta-crimson"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden className="size-3">
                        <path
                          d="M5 5l10 10M15 5L5 15"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </li>
                ))}

                {/* Empty slots make the cap legible without a sentence. */}
                {Array.from({ length: MAX_COMPARE - items.length }).map(
                  (_, i) => (
                    <li
                      key={`slot-${i}`}
                      aria-hidden
                      className="alta-corners hidden size-14 shrink-0 border border-dashed border-alta-200 sm:block"
                    />
                  ),
                )}
              </ul>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={clear}
                  className="px-3 py-2 text-sm font-semibold text-alta-400 transition hover:text-alta-crimson"
                >
                  გასუფთავება
                </button>

                {/* With one product picked this is not a dead button: it
                    opens the picker and asks what to compare against, which
                    is work the shopper would otherwise do alone. */}
                {enough ? (
                  <Link
                    href={compareHref(items.map((p) => p.id))}
                    className="alta-corners bg-alta-purple px-6 py-3 text-sm font-bold text-white transition hover:bg-alta-700"
                  >
                    შედარება ({items.length})
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="alta-corners bg-alta-purple px-6 py-3 text-sm font-bold text-white transition hover:bg-alta-700"
                  >
                    შედარება ({items.length})
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {picking && items.length === 1 && (
        <ComparePicker
          selected={items[0]}
          onPick={(id) => {
            toggle(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

/** Asked when a pick comes from a different category than the current list. */
function SwitchPrompt({
  fromLabel,
  count,
  onConfirm,
  onCancel,
}: {
  fromLabel: string;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="დახურვა"
        onClick={onCancel}
        className="absolute inset-0 bg-alta-purple-deep/60"
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="compare-switch-title"
        className="alta-corners-xl relative z-10 w-full max-w-md bg-white p-6 shadow-2xl"
      >
        <h2
          id="compare-switch-title"
          className="text-base font-bold text-alta-purple-deep"
        >
          სხვა კატეგორიის პროდუქტია
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-alta-700">
          შედარებაში უკვე გაქვთ {count} პროდუქტი კატეგორიიდან „{fromLabel}“.
          შედარება მხოლოდ ერთი კატეგორიის შიგნით მუშაობს — გსურთ არჩეულის
          გასუფთავება და თავიდან დაწყება?
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="alta-corners bg-alta-purple px-5 py-2.5 text-sm font-bold text-white transition hover:bg-alta-700"
          >
            გასუფთავება და დაწყება
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="alta-corners border border-alta-200 bg-white px-5 py-2.5 text-sm font-bold text-alta-purple-deep transition hover:bg-alta-50"
          >
            გაუქმება
          </button>
        </div>
      </div>
    </div>
  );
}
