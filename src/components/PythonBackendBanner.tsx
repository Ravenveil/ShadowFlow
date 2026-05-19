/**
 * PythonBackendBanner — red horizontal banner shown when the Python FastAPI
 * backend (port 8000) is unreachable.
 *
 * Mounted at the top of any page whose data depends on Python:
 *   - /teams (TabTeams)
 *   - /run-session/:id (RunSessionLiveView)
 *   - /chat (ChatPage)
 *
 * Renders nothing while status is null (initial probe in flight) or true.
 */
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { usePythonBackendStatus } from '../core/hooks/usePythonBackendStatus';

const PythonBackendBanner: React.FC = () => {
  const { available, lastError, recheck } = usePythonBackendStatus();
  const [rechecking, setRechecking] = React.useState(false);

  if (available !== false) return null;

  const handleRecheck = async () => {
    setRechecking(true);
    try {
      await recheck();
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div
      role="alert"
      data-testid="python-backend-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        margin: '0 0 12px 0',
        background: 'rgba(220, 38, 38, 0.08)',
        border: '1px solid rgba(220, 38, 38, 0.35)',
        borderLeft: '3px solid #ef4444',
        borderRadius: 8,
        fontSize: 12.5,
        color: 'var(--t-fg, #FAFAFA)',
      }}
    >
      <AlertTriangle size={16} strokeWidth={2} color="#ef4444" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          Python 后端未启动（默认端口 8000）
        </div>
        <div style={{ color: 'var(--t-fg-3, #A1A1AA)', fontSize: 11.5 }}>
          Teams / Workflow / Chat 等功能需要 Python 后端。
          {lastError?.hint ? (
            <>
              {' '}启动命令：
              <code
                style={{
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  background: 'var(--t-bg-elev-2, #141414)',
                  border: '1px solid var(--t-border, #27272A)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 11,
                  marginLeft: 4,
                  color: 'var(--t-fg-1, #FAFAFA)',
                }}
              >
                python -m uvicorn shadowflow.server:app --port 8000
              </code>
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={handleRecheck}
        disabled={rechecking}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          background: 'var(--t-bg-elev-2, #141414)',
          border: '1px solid var(--t-border, #27272A)',
          borderRadius: 6,
          color: 'var(--t-fg-1, #FAFAFA)',
          fontSize: 11.5,
          cursor: rechecking ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
        data-testid="python-backend-banner-retry"
      >
        <RefreshCw
          size={12}
          strokeWidth={2}
          style={{
            animation: rechecking ? 'sf-spin 0.8s linear infinite' : undefined,
          }}
        />
        重试
      </button>
    </div>
  );
};

export default PythonBackendBanner;
