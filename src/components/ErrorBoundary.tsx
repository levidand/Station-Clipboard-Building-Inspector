import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "./ui";

/**
 * If a page throws while drawing, say so in a sentence with a way back,
 * instead of leaving a blank screen. The error's own words are shown small,
 * so they can be read out to support.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The page stopped:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-6 text-ink">
        <div className="flex max-w-lg flex-col items-center text-center">
          <AlertTriangle className="h-10 w-10 text-orange" />
          <h1 className="mt-3 text-[22px] font-medium">Something went wrong on this page</h1>
          <p className="mt-1.5 text-[16px] leading-6 text-ink-2">
            Nothing you saved is lost. Reload to carry on; if it happens again, tell support what you pressed.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" size="lg" onClick={() => window.location.reload()}><RotateCw className="h-5 w-5" />Reload</Button>
            <Button size="lg" onClick={() => { window.location.href = "/"; }}>Go to Today</Button>
          </div>
          <p className="mt-6 break-all font-mono text-[13px] text-ink-4">{error.message}</p>
        </div>
      </div>
    );
  }
}
