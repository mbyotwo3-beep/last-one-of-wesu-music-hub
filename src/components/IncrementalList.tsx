import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Pure windowing logic (unit-testable without DOM).
// ---------------------------------------------------------------------------

/** Grow the visible window by one page, never exceeding the total. */
export function extendVisibleCount(visible: number, total: number, pageSize: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(visible, 0) + Math.max(pageSize, 1), total);
}

/**
 * Reconcile the visible window when the underlying list changes (like,
 * remove, reorder, fresh fetch). Keeps the user's scroll depth when the
 * list grows, clamps when it shrinks, and never shows an empty window
 * for a non-empty list.
 */
export function clampVisibleCount(prev: number, total: number, pageSize: number): number {
  if (total <= 0) return 0;
  const min = Math.min(Math.max(pageSize, 1), total);
  if (prev < min) return min;
  if (prev > total) return total;
  return prev;
}

/** Whether more rows remain below the current window. */
export function hasMoreItems(visible: number, total: number): boolean {
  return visible < total;
}

// ---------------------------------------------------------------------------
// Component: renders the first page of a long list, then appends more as
// the user scrolls (IntersectionObserver sentinel + "Show more" fallback).
// Keeps low-end devices fast: fewer DOM nodes, fewer mounted cover images.
// Indexes passed to renderItem are TRUE list indexes (slice starts at 0),
// so play/remove/move handlers keep working on full-list arrays.
// ---------------------------------------------------------------------------

interface IncrementalListProps<T> {
  items: T[];
  pageSize?: number;
  keyFor: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  empty?: ReactNode;
  moreLabel?: (remaining: number) => string;
}

export function IncrementalList<T>({
  items,
  pageSize = 30,
  keyFor,
  renderItem,
  className,
  empty,
  moreLabel = (remaining) => `Show more (${remaining} remaining)`,
}: IncrementalListProps<T>) {
  const [visible, setVisible] = useState(() => clampVisibleCount(pageSize, items.length, pageSize));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reconcile (never reset) when the list itself changes.
  useEffect(() => {
    setVisible((prev) => clampVisibleCount(prev, items.length, pageSize));
  }, [items.length, pageSize]);

  useEffect(() => {
    if (!hasMoreItems(visible, items.length)) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((prev) => extendVisibleCount(prev, items.length, pageSize));
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, items.length, pageSize]);

  if (items.length === 0) return <>{empty}</>;

  const shown = items.slice(0, visible);
  const remaining = items.length - visible;

  return (
    <div className={className}>
      {shown.map((item, i) => (
        <Fragment key={keyFor(item, i)}>{renderItem(item, i)}</Fragment>
      ))}
      {remaining > 0 && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <button
            type="button"
            onClick={() => setVisible((prev) => extendVisibleCount(prev, items.length, pageSize))}
            className="px-5 py-2 text-sm font-medium rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer"
          >
            {moreLabel(remaining)}
          </button>
        </div>
      )}
    </div>
  );
}
