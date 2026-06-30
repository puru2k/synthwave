import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Keeps a thrown render/runtime error (e.g. a malformed VCD parse or a worker
// callback) from blanking the whole app, and gives the user a way to recover.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
     
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-screen">
        <div className="error-card">
          <h1>Something went wrong</h1>
          <p>The interface hit an unexpected error. Your saved work is still in local storage.</p>
          <pre>{this.state.error.message}</pre>
          <div className="error-actions">
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn primary" onClick={() => location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
