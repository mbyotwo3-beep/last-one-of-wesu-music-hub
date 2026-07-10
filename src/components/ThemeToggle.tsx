import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = `Theme: ${theme}. Switch to ${next}.`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
      className="inline-flex items-center justify-center size-9 rounded-full border border-border bg-card text-foreground hover:bg-accent transition-colors"
      suppressHydrationWarning
    >
      <Icon className="size-4" />
    </button>
  );
}
