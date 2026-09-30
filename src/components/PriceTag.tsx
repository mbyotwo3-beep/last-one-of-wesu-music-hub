import { useCurrency } from "@/stores/currency";

/**
 * The one place free-vs-paid is rendered.
 *
 * Before this existed the same track showed its price four different ways
 * across the app, and a K0 track was distinguished from a paid one only by the
 * presence of a number — so "Free" and "K15.00" looked alike, and a missing
 * price field looked free. With free music as the discovery hook, a listener
 * must be able to tell at a glance what costs money.
 *
 * The label is always present: silence is not an answer.
 */
export function PriceTag({
  price,
  owned,
  ownedLabel = "Owned",
  className = "",
}: {
  /** Null/undefined means "no price known" — never silently read as free. */
  price?: number | null;
  /** Suppresses the price and shows an owned badge instead. */
  owned?: boolean;
  ownedLabel?: string;
  className?: string;
}) {
  const formatPrice = useCurrency((s) => s.formatPrice);

  if (owned) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary ${className}`}
      >
        {ownedLabel}
      </span>
    );
  }

  if (price === null || price === undefined) {
    return <span className={`text-[11px] font-medium text-muted-foreground ${className}`}>—</span>;
  }

  if (Number(price) <= 0) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 ${className}`}
        title="Free to stream"
      >
        Free
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground ${className}`}
      title="Costs money — buy once, keep forever"
    >
      {formatPrice(Number(price))}
    </span>
  );
}
