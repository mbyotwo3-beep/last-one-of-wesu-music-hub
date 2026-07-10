import { ReactNode } from "react";

interface HorizontalShelfProps {
  title: string;
  children: ReactNode;
  showAllLink?: string;
}

export function HorizontalShelf({ title, children, showAllLink }: HorizontalShelfProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {showAllLink && (
          <button className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
            See All
          </button>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 px-2 scrollbar-hide">
        {children}
      </div>
    </div>
  );
}
