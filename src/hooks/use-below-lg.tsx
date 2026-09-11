import * as React from "react";

const LG_BREAKPOINT = 1024;

/** Returns true when viewport width is below Tailwind's `lg` breakpoint (1024px). */
export function useBelowLg() {
  const [below, setBelow] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth > 0 && window.innerWidth < LG_BREAKPOINT;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${LG_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      // Guard: when window is minimized or backgrounded in Windows/Chrome, window.innerWidth can report 0.
      // Never treat a minimized window as a mobile viewport, which causes full app remounts!
      if (window.innerWidth > 0) {
        setBelow(e.matches);
      }
    };
    mql.addEventListener("change", onChange);
    if (window.innerWidth > 0) {
      setBelow(mql.matches);
    }
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return below;
}
