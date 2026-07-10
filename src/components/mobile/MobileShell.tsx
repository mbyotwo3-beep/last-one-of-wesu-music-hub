import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BottomTabBar } from "./BottomTabBar";
import { MiniPlayer } from "./MiniPlayer";
import { NowPlayingSheet } from "./NowPlayingSheet";
import { StatusBarInit } from "./StatusBarInit";
import { ThemeToggle } from "@/components/ThemeToggle";

interface MobileShellProps {
  children: ReactNode;
}

/**
 * Top-level layout wrapper for native (Capacitor) platform.
 * Replaces Navbar + PlayerBar with a branded top bar + BottomTabBar + MiniPlayer.
 * NowPlayingSheet slides up in-place (no route change).
 * Applies safe-area insets so content is never obscured.
 *
 * Feature: wesu-plus-completion
 */
export function MobileShell({ children }: MobileShellProps) {
  return (
    <>
      <StatusBarInit />
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] pb-2 bg-background/95 backdrop-blur border-b border-border">
        <Link to="/" aria-label="Wesu+ home" className="flex items-center gap-2">
          <img src="/images/wesu-logo.png" alt="Wesu+" className="h-10 w-auto" />
        </Link>
        <ThemeToggle />
      </header>
      <div className="pt-[calc(env(safe-area-inset-top)+3.25rem)] pb-[calc(env(safe-area-inset-bottom)+4rem+4rem)]">
        {children}
      </div>
      {/* Mini player sits above bottom nav */}
      <MiniPlayer />
      {/* Full-screen Now Playing sheet — slides up on demand */}
      <NowPlayingSheet />
      <BottomTabBar />
    </>
  );
}
