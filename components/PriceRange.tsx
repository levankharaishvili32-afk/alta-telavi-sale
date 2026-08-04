"use client";

import { useId, useState } from "react";
import { formatPrice } from "@/lib/format";

const STEP = 10;

type Props = {
  bounds: { min: number; max: number };
  value: { min: number | null; max: number | null };
  onCommit: (min: number | null, max: number | null) => void;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export default function PriceRange({ bounds, value, onCommit }: Props) {
  const id = useId();
  const lo = Math.floor(bounds.min / STEP) * STEP;
  const hi = Math.max(lo + STEP, Math.ceil(bounds.max / STEP) * STEP);

  const [draft, setDraft] = useState<[number, number]>([
    value.min ?? lo,
    value.max ?? hi,
  ]);

  // Re-sync when the URL (or the surrounding facets) change from outside.
  // Render-phase adjustment rather than an effect — React re-renders
  // immediately without painting the stale value.
  const signature = `${value.min}|${value.max}|${lo}|${hi}`;
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (syncedSignature !== signature) {
    setSyncedSignature(signature);
    setDraft([clamp(value.min ?? lo, lo, hi), clamp(value.max ?? hi, lo, hi)]);
  }

  const [dMin, dMax] = draft;
  const leftPct = ((dMin - lo) / (hi - lo)) * 100;
  const rightPct = ((dMax - lo) / (hi - lo)) * 100;

  const commit = (next: [number, number]) => {
    const [a, b] = next;
    onCommit(a <= lo ? null : a, b >= hi ? null : b);
  };

  const setLower = (raw: number) => {
    const next: [number, number] = [clamp(raw, lo, dMax), dMax];
    setDraft(next);
    return next;
  };
  const setUpper = (raw: number) => {
    const next: [number, number] = [dMin, clamp(raw, dMin, hi)];
    setDraft(next);
    return next;
  };

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-alta-700">
        <span>{formatPrice(dMin)}</span>
        <span>{formatPrice(dMax)}</span>
      </div>

      <div className="relative mt-3 h-5">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-alta-100" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full alta-rule"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
        <input
          type="range"
          className="range-thumb absolute inset-x-0 top-0 h-5 w-full"
          min={lo}
          max={hi}
          step={STEP}
          value={dMin}
          aria-label="მინიმალური ფასი"
          onChange={(e) => setLower(Number(e.target.value))}
          onPointerUp={(e) => commit(setLower(Number(e.currentTarget.value)))}
          onKeyUp={(e) => commit(setLower(Number(e.currentTarget.value)))}
          onBlur={(e) => commit(setLower(Number(e.currentTarget.value)))}
        />
        <input
          type="range"
          className="range-thumb absolute inset-x-0 top-0 h-5 w-full"
          min={lo}
          max={hi}
          step={STEP}
          value={dMax}
          aria-label="მაქსიმალური ფასი"
          onChange={(e) => setUpper(Number(e.target.value))}
          onPointerUp={(e) => commit(setUpper(Number(e.currentTarget.value)))}
          onKeyUp={(e) => commit(setUpper(Number(e.currentTarget.value)))}
          onBlur={(e) => commit(setUpper(Number(e.currentTarget.value)))}
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex-1">
          <label
            htmlFor={`${id}-min`}
            className="mb-1 block text-[11px] font-medium text-alta-400"
          >
            მინ. ₾
          </label>
          <input
            id={`${id}-min`}
            type="number"
            inputMode="numeric"
            min={lo}
            max={hi}
            value={dMin}
            onChange={(e) => setLower(Number(e.target.value))}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(draft);
            }}
            className="w-full rounded-md border border-alta-200 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-alta-purple focus:ring-2 focus:ring-alta-100"
          />
        </div>
        <span className="mt-5 text-alta-300">–</span>
        <div className="flex-1">
          <label
            htmlFor={`${id}-max`}
            className="mb-1 block text-[11px] font-medium text-alta-400"
          >
            მაქს. ₾
          </label>
          <input
            id={`${id}-max`}
            type="number"
            inputMode="numeric"
            min={lo}
            max={hi}
            value={dMax}
            onChange={(e) => setUpper(Number(e.target.value))}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(draft);
            }}
            className="w-full rounded-md border border-alta-200 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-alta-purple focus:ring-2 focus:ring-alta-100"
          />
        </div>
      </div>
    </div>
  );
}
