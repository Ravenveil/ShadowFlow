/**
 * SecretsModal — API Keys 管理面板
 *
 * 2026-05-29 — 统一 BYOK 存储：本组件改为读写 **B 套 KEY_STORAGE**（与设置页
 * ApiKeySettings 同一份真相），不再写老的 `sf_secrets` JSON。claude↔anthropic
 * 映射对齐 B 套；backend_url 走独立 key `sf_backend_url`。这样无论在弹窗还是设置
 * 页配 key，chat/DM/群聊/run-session 都读得到同一份。详 memory/debt_byok_two_key_stores。
 */

import React, { useState } from 'react';
import { Key } from '../../common/icons/iconRegistry';
import {
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey,
  getBackendUrl,
  setBackendUrl,
} from '../../api/_base';

const DEFAULT_BACKEND_URL = 'http://localhost:8000';

export interface SFSecrets {
  zhipu_key: string;
  openai_key: string;
  claude_key: string;
  deepseek_key: string;
  backend_url: string;
}

/** 从 B 套 KEY_STORAGE 读出本弹窗管理的 4 个 key + backend_url。
 *  claude 字段映射 B 套 'anthropic'。 */
export function useSecrets(): SFSecrets {
  return {
    zhipu_key:    getStoredApiKey('zhipu') ?? '',
    openai_key:   getStoredApiKey('openai') ?? '',
    claude_key:   getStoredApiKey('anthropic') ?? '',
    deepseek_key: getStoredApiKey('deepseek') ?? '',
    backend_url:  getBackendUrl() ?? DEFAULT_BACKEND_URL,
  };
}

/** 写回 B 套 KEY_STORAGE：空值清除该 provider 的 key。 */
function saveSecrets(secrets: SFSecrets): void {
  const writeKey = (val: string, pid: 'zhipu' | 'openai' | 'anthropic' | 'deepseek') => {
    const v = val.trim();
    if (v) setStoredApiKey(v, pid);
    else clearStoredApiKey(pid);
  };
  writeKey(secrets.zhipu_key, 'zhipu');
  writeKey(secrets.openai_key, 'openai');
  writeKey(secrets.claude_key, 'anthropic');
  writeKey(secrets.deepseek_key, 'deepseek');
  setBackendUrl(secrets.backend_url);
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px 10px',
  borderRadius: 6,
  background: 'var(--t-panel-2)',
  border: '1px solid var(--t-border)',
  color: 'var(--t-fg)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--t-fg-3)',
  display: 'block',
  marginBottom: 4,
};

export function SecretsModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<SFSecrets>(useSecrets());

  const handleSave = () => {
    saveSecrets(form);
    onClose();
  };

  const setField = (field: keyof SFSecrets) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
  };

  return (
    <div
      data-testid="secrets-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 440,
        background: 'var(--skin-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-pop)',
        padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, flex: 1 }}>
            <Key size={14} strokeWidth={2} /> API Keys
          </span>
          <button
            className="fb-btn fb-btn-icon"
            onClick={onClose}
            aria-label="关闭"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}
          >×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>智谱 API Key</label>
            <input
              data-testid="secret-zhipu"
              type="password"
              value={form.zhipu_key}
              onChange={setField('zhipu_key')}
              placeholder="sk-..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>OpenAI API Key</label>
            <input
              data-testid="secret-openai"
              type="password"
              value={form.openai_key}
              onChange={setField('openai_key')}
              placeholder="sk-..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Claude API Key</label>
            <input
              data-testid="secret-claude"
              type="password"
              value={form.claude_key}
              onChange={setField('claude_key')}
              placeholder="sk-ant-..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>DeepSeek API Key</label>
            <input
              data-testid="secret-deepseek"
              type="password"
              value={form.deepseek_key}
              onChange={setField('deepseek_key')}
              placeholder="sk-..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Backend URL</label>
            <input
              data-testid="secret-backend-url"
              type="text"
              value={form.backend_url}
              onChange={setField('backend_url')}
              placeholder="http://localhost:8000"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{
          marginTop: 10,
          padding: '6px 8px',
          borderRadius: 5,
          background: 'var(--t-panel-2)',
          border: '1px solid var(--t-border)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--t-fg-4)',
          lineHeight: 1.5,
        }}>
          Keys 仅保存在本地浏览器 localStorage。发送消息时会通过 X-LLM-Key 请求头传给本地后端，后端再去调用 LLM 服务。Ollama 本地模型无需填写 key，仅需设置 Backend URL 即可。
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="fb-btn fb-btn-ghost fb-btn-sm" onClick={onClose}>取消</button>
          <button
            data-testid="secrets-save"
            className="fb-btn fb-btn-primary fb-btn-sm"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
