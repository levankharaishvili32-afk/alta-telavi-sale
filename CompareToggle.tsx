"use client";

import { useCompare } from "./CompareProvider";
import { MAX_COMPARE } from "@/lib/compare";

/**
 * The შედარება control. Two shapes for two contexts: a compact chip that sits
 * on a product card, and a full button for the detail page.
 *
 * At the cap the control is not disabled — a disabled button gives no
 * explanation and drops out of the tab order. It stays focusable and carries
 * the reason in its title and `aria-describedby`, and clicking it does
 * nothing.
 */
export default function CompareToggle({
  id,
  variant = "card",
  className = "",
}: {
  id: string;
  variant?: "card" | "detail";
  className?: string;
}) {
  const { isSelected, isBlocked, toggle } = useCompare();
  // During hydration the store reports an empty selection, matching the server
  // HTML exactly; the real one arrives on the render right after.
  const selected = isSelected(id);
  const blocked = isBlocked(id);

  const capNote = `შედარებაში მაქსიმუმ ${MAX_COMPARE} პროდუქტია — ჯერ ამოიღეთ ერთ-ერთი`;
  const label = selected ? "შედარებაშია" : "შედარება";

  if (variant === "card") {
    return (
      <button
        type="button"
        // The card is one big link; without this the click navigates instead.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!blocked) toggle(id);
        }}
        aria-pressed={selected}
        title={blocked ? capNote : label}
        className={`alta-corners relative z-10 inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-bold transition ${
          selected
            ? "border-alta-purple bg-alta-purple text-white"
            : blocked
              ? "cursor-not-allowed border-alta-100 bg-white/90 text-alta-300"
              : "border-alta-200 bg-white/90 text-alta-700 hover:border-alta-purple hover:text-alta-purple"
        } ${className}`}
      >
        <Glyph checked={selected} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => !blocked && toggle(id)}
      aria-pressed={selected}
      title={blocked ? capNote : label}
      className={`alta-corners inline-flex items-center gap-2.5 border px-6 py-3.5 text-sm font-bold transition ${
        selected
          ? "border-alta-purple bg-alta-purple text-white"
          : blocked
            ? "cursor-not-allowed border-alta-100 bg-white text-alta-300"
            : "border-alta-200 bg-white text-alta-purple-deep hover:bg-alta-50"
      } ${className}`}
    >
      <Glyph checked={selected} />
      {label}
    </button>
  );
}

function Glyph({ checked }: { checked: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4 shrink-0">
      {checked ? (
        <path
          d="M4 10.5l4 4 8-8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M4 15V7M10 15V4M16 15v-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
