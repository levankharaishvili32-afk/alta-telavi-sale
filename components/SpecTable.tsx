"use client";

import { useState } from "react";

/** Rows shown before the "show everything" toggle appears. */
const PREVIEW = 12;

/**
 * alta.ge's specification tables run to 70+ rows on phones and laptops, which
 * buries the related products and the rest of the page under a wall of text.
 * Show a readable slice first and let the shopper open the rest.
 *
 * Every row is in the markup from the start — the toggle only hides them — so
 * the full table is still in the HTML for search engines and for Ctrl+F.
 */
export default function SpecTable({ specs }: { specs: Record<string, string> }) {
  const entries = Object.entries(specs);
  const [expanded, setExpanded] = useState(false);
  const collapsible = entries.length > PREVIEW + 4;
  const hiddenCount = entries.length - PREVIEW;

  return (
    <div>
      <div className="alta-corners-xl relative mt-4 overflow-hidden border border-alta-100 bg-white">
        <dl>
          {entries.map(([key, value], i) => (
            <div
              key={key}
              hidden={collapsible && !expanded && i >= PREVIEW}
              className={`grid grid-cols-1 gap-1 px-6 py-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)] sm:gap-4 ${
                i % 2 ? "bg-alta-50" : "bg-white"
              }`}
            >
              <dt className="text-sm font-medium text-alta-400">{key}</dt>
              <dd className="text-sm font-semibold text-alta-purple-deep">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {collapsible && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent"
          />
        )}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="alta-corners mt-3 border border-alta-200 bg-white px-4 py-2.5 text-sm font-semibold text-alta-purple transition hover:bg-alta-50"
        >
          {expanded
            ? "ნაკლების ჩვენება"
            : `კიდევ ${hiddenCount} მახასიათებლის ჩვენება`}
        </button>
      )}
    </div>
  );
}
