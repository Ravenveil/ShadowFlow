import { useEffect, useRef } from 'react';

export interface RemovedFieldItem {
  path: string;
  pattern: string;
  sample_masked: string;
}

interface SanitizeReviewModalProps {
  open: boolean;
  removedFields: RemovedFieldItem[];
  onConfirm: () => void;
  onCancel: () => void;
  zh?: boolean;
}

const PATTERN_LABELS: Record<string, { en: string; zh: string }> = {
  email: { en: 'Email', zh: '邮箱' },
  phone_cn: { en: 'Phone (CN)', zh: '手机号(中国)' },
  phone_intl: { en: 'Phone (Intl)', zh: '手机号(国际)' },
  id_card_cn: { en: 'ID Card (CN)', zh: '身份证' },
  bank_card: { en: 'Bank Card', zh: '银行卡' },
  api_key_sk: { en: 'API Key (sk-)', zh: 'API 密钥 (sk-)' },
  api_key_ghp: { en: 'GitHub Token', zh: 'GitHub Token' },
  api_key_google: { en: 'Google API Key', zh: 'Google API 密钥' },
  jwt: { en: 'JWT Token', zh: 'JWT Token' },
  eth_private_key: { en: 'ETH Private Key', zh: '以太坊私钥' },
  blacklist_field: { en: 'Sensitive Field', zh: '敏感字段' },
};

export function SanitizeReviewModal({
  open, removedFields, onConfirm, onCancel, zh = false,
}: SanitizeReviewModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const TITLE_ID = 'sanitize-review-title';

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  // S2: default focus on Cancel (conservative default)
  useEffect(() => { if (open) cancelRef.current?.focus(); }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 32px', minWidth: 420, maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={TITLE_ID}
          style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--fg-0)', letterSpacing: '-.02em' }}
        >
          {zh ? '发现敏感信息' : 'Sensitive Data Detected'}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.5 }}>
          {zh
            ? `扫描到 ${removedFields.length} 处敏感字段，已自动脱敏。确认后继续上传，或取消返回编辑。`
            : `Found ${removedFields.length} sensitive field(s), auto-redacted. Confirm to proceed with upload, or cancel.`}
        </p>

        <div style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg-3)', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>{zh ? '路径' : 'Path'}</th>
                <th style={{ padding: '6px 8px' }}>{zh ? '类型' : 'Type'}</th>
                <th style={{ padding: '6px 8px' }}>{zh ? '脱敏预览' : 'Masked'}</th>
              </tr>
            </thead>
            <tbody>
              {removedFields.map((f, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,.06))' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--fg-2)', wordBreak: 'break-all' }}>{f.path}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--status-reject, #ef4444)' }}>
                    {(PATTERN_LABELS[f.pattern] || { en: f.pattern, zh: f.pattern })[zh ? 'zh' : 'en']}
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--fg-4, #666)' }}>{f.sample_masked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--status-reject)', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--bg-elev-3)', border: '1px solid var(--border)', color: 'var(--fg-2)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            {zh ? '确认继续上传' : 'Confirm Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
