import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** P20: Tracks retry attempts to prevent infinite re-throw cycles. */
  retryCount: number;
}

const MAX_RETRIES = 3;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState((s) => ({ hasError: false, error: null, retryCount: s.retryCount + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const canRetry = this.state.retryCount < MAX_RETRIES;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32, textAlign: 'center', background: 'var(--bg)', color: 'var(--fg-2)' }}>
          <span style={{ fontSize: 32 }}>⚠</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--fg-1)', marginBottom: 4 }}>组件加载出错</p>
            <p style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
              {this.state.error?.message ?? '未知错误'}
            </p>
          </div>
          {canRetry ? (
            <button
              onClick={this.handleRetry}
              style={{ padding: '6px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              重试（剩余 {MAX_RETRIES - this.state.retryCount} 次）
            </button>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)' }}>
              已达最大重试次数，请刷新页面
            </p>
          )}
        </div>
      );
    }
    // P20: key forces children subtree to remount after each retry, clearing stale state
    return (
      <React.Fragment key={this.state.retryCount}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
