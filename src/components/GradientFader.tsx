import { useEffect, useRef, useState } from "react";

import {
  crossfadeOpacity,
  initialCrossfade,
  pruneCrossfade,
  pushCrossfade,
  releaseCrossfade,
  type CrossfadeState,
} from "@/lib/gradient-crossfade";

interface GradientFaderProps {
  /** Any CSS background value — gradients, radial washes, solid colours. */
  css: string;
  className?: string;
  /** Cross-fade length in ms; the sheet's colour glides use 600. */
  duration?: number;
}

/**
 * Cross-fades between background values, because CSS refuses to animate
 * gradients.
 *
 * All DECISIONS live in src/lib/gradient-crossfade.ts, as a pure state
 * machine with its own suite; this shell only wires the three transitions
 * to the browser:
 *
 *   arrive  — effect on `css`: mounts the new colour at opacity 0
 *   release — two rAFs later (two frames, so Chromium cannot coalesce the
 *             mount-opacity and the fade into one paint), starts the fade
 *   prune   — `duration`+60ms later: the leaving layer is dropped so fades
 *             never stack; an hour of listening stays two layers deep
 *
 * Every step is idempotent, which is what makes React StrictMode's double
 * effect-invoke and a same-value re-render both safe: the machine tests
 * sameness itself, and the timers run their pure ops through functional
 * updates so a stale closure cannot rewind an in-flight layer id.
 */
export function GradientFader({ css, className = "", duration = 600 }: GradientFaderProps) {
  const [state, setState] = useState<CrossfadeState>(() => initialCrossfade(css));
  const frameCleanup = useRef<null | (() => void)>(null);
  const pruneRef = useRef<number | null>(null);

  useEffect(() => {
    // Two frames at opacity 0, then the release. The chain lives entirely
    // inside this effect so a second change inside the arm window re-runs
    // the choreography; a change that arrives and is cancelled mid-arm
    // leaves behind exactly the cleanup below.
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => setState(releaseCrossfade));
      frameCleanup.current = () => cancelAnimationFrame(second);
    });
    frameCleanup.current = () => cancelAnimationFrame(first);

    // Per-instance timer ref (not effect-local state): the cleanup below
    // must find the timer even when the effect re-ran in between.
    if (pruneRef.current !== null) window.clearTimeout(pruneRef.current);
    pruneRef.current = window.setTimeout(() => {
      pruneRef.current = null;
      setState(pruneCrossfade);
    }, duration + 60);

    setState((prev) => pushCrossfade(prev, css));

    return () => {
      frameCleanup.current?.();
      if (pruneRef.current !== null) {
        window.clearTimeout(pruneRef.current);
        pruneRef.current = null;
      }
    };
  }, [css, duration]);

  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      {state.layers.map((layer) => (
        <div
          key={layer.id}
          data-gradient-layer={layer.id === state.latestId ? "current" : "leaving"}
          className="absolute inset-0 transition-opacity ease-out"
          style={{
            background: layer.css,
            opacity: crossfadeOpacity(layer.id, state),
            transitionDuration: `${duration}ms`,
          }}
        />
      ))}
    </div>
  );
}
