import type { Range } from "@/lib/search";

/**
 * Paints the matched parts of a search result.
 *
 * The ranges are offsets into `text` itself, already translated back from the
 * folded form the matching ran on (see `titleRanges` in `lib/search.ts`), so
 * this only has to slice.
 *
 * `<mark>` rather than a span with a colour, because that is what the element
 * is for: a screen reader and a browser's find-in-page both understand it, and
 * it keeps the styling in one place.
 */
export default function Highlight({
  text,
  ranges,
}: {
  text: string;
  ranges?: readonly Range[];
}) {
  if (!ranges?.length) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const [start, end] of ranges) {
    if (start >= text.length) break;
    const from = Math.max(cursor, start);
    const to = Math.min(text.length, end);
    if (to <= from) continue;
    if (from > cursor) parts.push(text.slice(cursor, from));
    parts.push(
      <mark
        key={from}
        className="rounded-[2px] bg-alta-teal/45 px-px text-inherit"
      >
        {text.slice(from, to)}
      </mark>,
    );
    cursor = to;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
