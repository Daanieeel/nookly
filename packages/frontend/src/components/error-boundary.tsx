import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@nookly/ui/components/button";

interface Props {
  /// What to show instead of the crashed children; `reset` tries them again.
  fallback: (reset: () => void) => ReactNode;
  /// Tries the children again on its own whenever one of these changes.
  resetKeys?: readonly unknown[];
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/// Catches a render error in its children so one broken view cannot unmount the app.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("View crashed", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    const { resetKeys = [] } = this.props;
    const before = prev.resetKeys ?? [];
    if (
      this.state.failed &&
      (before.length !== resetKeys.length || before.some((key, i) => !Object.is(key, resetKeys[i])))
    ) {
      this.reset();
    }
  }

  reset = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}

/// The plain "something broke" fallback: a short message and a way to retry.
export function CrashFallback({ reset, what }: { reset: () => void; what: string }) {
  return (
    <div role="alert" className="flex size-full flex-col items-center justify-center gap-3 p-6">
      <p className="text-sm text-muted-foreground">Something went wrong showing {what}.</p>
      <Button variant="secondary" size="sm" onClick={reset}>
        Try Again
      </Button>
    </div>
  );
}
