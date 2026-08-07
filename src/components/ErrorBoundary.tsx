import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /**
   * Where this boundary sits, e.g. "app-root" or "consumer-order". Included in
   * the log line so a report identifies which subtree failed.
   */
  scope: string;
  /**
   * Component rendering the replacement UI. `reset` clears the error and
   * re-mounts the subtree, which is worth offering when the failure may be
   * transient.
   *
   * A component type, not a render callback: invoking it as a plain function
   * would run its hooks inside this class's render, which React rejects with
   * "invalid hook call". Fallbacks legitimately need hooks — the consumer one
   * reads route params to identify the table.
   */
  fallback: ComponentType<{ error: Error; reset: () => void; scope: string }>;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one failing component cannot unmount the whole tree.
 *
 * Without this, any uncaught render error leaves the user on a blank white page
 * with no message and no way forward — for a diner mid-order that reads as the
 * app having lost their order.
 *
 * Deliberately generic: the boundary handles catching and logging, and each
 * mount supplies its own fallback, because what to tell someone depends
 * entirely on what they were doing when it broke.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Structured so the scope and component stack are greppable. Kept to the
    // console deliberately: there is no client-side error ingest endpoint in
    // this project yet, and inventing one here would be out of scope. When one
    // exists, this is the single place to forward from.
    console.error("[ErrorBoundary] uncaught render error", {
      scope: this.props.scope,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const Fallback = this.props.fallback;
    return <Fallback error={error} reset={this.reset} scope={this.props.scope} />;
  }
}

export default ErrorBoundary;
