import React from "react";
import { toast } from "react-toastify";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Captured error:", error, errorInfo);
    try {
      toast.error(
        (this.props.message || "Ocorreu um erro inesperado.") +
          (error?.message ? ` (${error.message})` : "")
      );
    } catch (_e) {
      // ignore toast errors
    }
    if (typeof this.props.onError === "function") {
      try {
        this.props.onError(error, errorInfo);
      } catch (_e) {
        // ignore
      }
    }
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === "function"
          ? this.props.fallback(this.reset)
          : this.props.fallback;
      }
      return null;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
