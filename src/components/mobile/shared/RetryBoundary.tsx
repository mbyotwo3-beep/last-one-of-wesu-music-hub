import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Component, type ErrorInfo } from "react";

interface Props {
  queryKey: QueryKey;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary that shows a retry prompt when a query-driven section fails.
 * Displays "Could not load content — tap to retry" with a retry button.
 *
 * Feature: wesu-plus-completion
 */
export class RetryBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RetryBoundary] Caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <RetryFallback
          queryKey={this.props.queryKey}
          onReset={() => this.setState({ hasError: false })}
        />
      );
    }
    return this.props.children;
  }
}

function RetryFallback({ queryKey, onReset }: { queryKey: QueryKey; onReset: () => void }) {
  const queryClient = useQueryClient();

  function handleRetry() {
    queryClient.invalidateQueries({ queryKey });
    onReset();
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">Could not load content — tap to retry</p>
      <button
        onClick={handleRetry}
        className="min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
      >
        Retry
      </button>
    </div>
  );
}
