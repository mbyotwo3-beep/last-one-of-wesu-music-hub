import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildHeroPool,
  shuffleHeroPool,
  type PoolAlbum,
  type PoolSong,
  type PoolSlide,
} from "@/lib/hero-pool";

/**
 * A rotating pool of songs and albums for the homepage hero.
 *
 * WHY THE SHUFFLE IS IN AN EFFECT AND NOT IN RENDER
 *
 * This component renders on the server and again during hydration. Picking a
 * random slide during render means the server can emit one album and the client
 * another, React discards the server's markup, and every listener sees the hero
 * visibly jump on every page load.
 *
 * So: render 1 (server AND first client render) always uses the deterministic
 * pool order. The shuffle runs once in an effect, after hydration has finished
 * and there is nothing left to disagree with. The hero then animates to its new
 * slide, which reads as the carousel doing its job.
 *
 * The effect is guarded by a ref so it cannot run a second time — a re-render
 * with fresh query data must not reshuffle under the listener.
 *
 * The pool itself is recomputed only when the underlying lists change. Without
 * the memo, every parent render would build a new array identity and the memo
 * below would see a "changed" pool on each pass.
 */
export function useHeroPool(albums: PoolAlbum[], songs: PoolSong[]): PoolSlide[] {
  const deterministic = useMemo(() => buildHeroPool(albums, songs), [albums, songs]);

  // Default argument is evaluated on every render, so seed is captured before
  // any state update and stays stable for that render pass.
  const [pool, setPool] = useState<PoolSlide[]>(deterministic);
  const shuffled = useRef(false);

  // A new query result must replace the pool, not be ignored because the
  // component happens to have already mounted.
  const sourceChanged = deterministic !== pool;
  useEffect(() => {
    if (sourceChanged) {
      setPool(deterministic);
      shuffled.current = false;
      return;
    }
    if (shuffled.current || pool.length < 2) return;
    shuffled.current = true;
    setPool(shuffleHeroPool(pool, Math.floor(Math.random() * 0x7fffffff)));
  }, [deterministic, pool, sourceChanged]);

  return pool;
}
