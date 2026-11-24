import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'An unexpected error occurred while running Neon Dash.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed && typeof parsed.error === 'string') {
        readable = `Leaderboard sync error (${parsed.operationType ?? 'request'}): ${parsed.error}`;
      }
    } catch {
      if (error.message) readable = error.message;
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Neon Dash UI ErrorBoundary caught error:', error, info);
  }

  handleRecover = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#060714] text-slate-100">
        <div className="neon-panel w-full max-w-md rounded-2xl p-6 text-center">
          <h2 className="font-display font-bold text-2xl text-white">Something went wrong</h2>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">{this.state.message}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRecover}
              className="neon-btn-primary min-h-[44px] px-5 py-2.5 rounded-xl font-display font-bold text-sm text-white flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Continue</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
