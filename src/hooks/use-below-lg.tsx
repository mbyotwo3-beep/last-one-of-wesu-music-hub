import * as React from "react";

const LG_BREAKPOINT = 1024;

/** Returns true when viewport width is below Tailwind's `lg` breakpoint (1024px). */
export function useBelowLg() {
  const [below, setBelow] = React.useState<boolean>(false);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${LG_BREAKPOINT - 1}px)`);
    const onChange = () => setBelow(window.innerWidth < LG_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return below;
}
