import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="err-boundary">
          <div className="err-boundary-icon">⚠</div>
          <div className="err-boundary-title">Something went wrong</div>
          <div className="err-boundary-msg">
            {this.state.error?.message || "An unexpected error occurred in this panel."}
          </div>
          <button
            className="err-boundary-btn"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
