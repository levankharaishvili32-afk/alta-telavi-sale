/** Discount percentage, rounded to the nearest whole number. */
export function discountPercent(oldPrice: number, promoPrice: number): number {
  if (!oldPrice || oldPrice <= promoPrice) return 0;
  return Math.round(((oldPrice - promoPrice) / oldPrice) * 100);
}

/**
 * e.g. 1649 -> "1 649 ₾" (non-breaking thin space for thousands, comma for
 * decimals, per Georgian convention).
 *
 * Grouped by hand rather than via Intl: Node and browsers ship different
 * ka-GE grouping data, so Intl renders the same price differently on the
 * server and the client.
 */
export function formatPrice(value: number): string {
  const [whole, cents] = Math.abs(value).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  const sign = value < 0 ? "−" : "";
  return cents === "00"
    ? `${sign}${grouped} ₾`
    : `${sign}${grouped},${cents} ₾`;
}

export function savings(oldPrice: number, promoPrice: number): number {
  return Math.max(0, oldPrice - promoPrice);
}
