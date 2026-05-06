import { useCallback, useState } from 'react';
import { uploadYamlForMarket, publishTemplate } from '../../hooks/useTemplateRegistry';
import { serializeWorkflow } from '../../lib/yamlSerializer';
import { useWorkflow } from '../../stores/workflowStore';

type Stage = 'idle' | 'uploading' | 'publishing' | 'done' | 'error';

interface PublishTemplateDialogProps {
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  background: 'var(--bg-elev-2)',
  border: '1px solid var(--border)',
  color: 'var(--fg-0)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--fg-4)',
  marginBottom: 5,
  display: 'block',
};

export function PublishTemplateDialog({ onClose }: PublishTemplateDialogProps) {
  const { nodes, edges } = useWorkflow();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceEth, setPriceEth] = useState('0');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cid, setCid] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const nodeCount = nodes.length;

  const handlePublish = useCallback(async () => {
    if (!title.trim()) { setError('请填写模板名称'); return; }
    if (nodeCount === 0) { setError('当前工作流为空，无法上架'); return; }

    const priceNum = parseFloat(priceEth);
    if (isNaN(priceNum) || priceNum < 0) { setError('价格格式不正确'); return; }

    setError(null);

    // Step 1: Export YAML
    const yaml = serializeWorkflow(nodes, edges);

    // Step 2: Upload to 0G Storage
    setStage('uploading');
    let uploadedCid: string;
    try {
      uploadedCid = await uploadYamlForMarket(yaml);
      setCid(uploadedCid);
    } catch (e) {
      setStage('error');
      setError(e instanceof Error ? e.message : '上传失败');
      return;
    }

    // Step 3: Register on chain
    setStage('publishing');
    const uuid = crypto.randomUUID();
    try {
      const tid = await publishTemplate({
        uuid,
        cid: uploadedCid,
        priceEth: priceNum.toString(),
        title: title.trim(),
        description: description.trim(),
      });
      setTemplateId(tid);
      setStage('done');
    } catch (e) {
      setStage('error');
      setError(e instanceof Error ? e.message : '链上注册失败');
    }
  }, [title, description, priceEth, nodes, edges, nodeCount]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 480, background: 'var(--bg-elev-1)',
          border: '1px solid var(--border)', borderRadius: 16,
          padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>
              0G Chain · Galileo
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--fg-0)' }}>
              发布模板到市场
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--fg-4)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Workflow preview */}
        <div style={{ padding: '10px 14px', background: 'var(--bg-elev-2)', borderRadius: 8, fontSize: 12, color: 'var(--fg-4)' }}>
          当前工作流：<strong style={{ color: 'var(--fg-1)' }}>{nodeCount} 个节点</strong>
          {nodeCount === 0 && <span style={{ color: '#f87171', marginLeft: 8 }}>⚠ 工作流为空</span>}
        </div>

        {stage !== 'done' ? (
          <>
            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>模板名称 *</label>
                <input
                  style={inputStyle}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="简洁有吸引力的名称，如「GPT-4 代码审查工作流」"
                  disabled={stage !== 'idle'}
                />
              </div>

              <div>
                <label style={labelStyle}>描述</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="这个模板能帮用户做什么？适合哪些场景？"
                  disabled={stage !== 'idle'}
                />
              </div>

              <div>
                <label style={labelStyle}>价格 (A0GI)</label>
                <input
                  style={{ ...inputStyle, maxWidth: 160 }}
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceEth}
                  onChange={(e) => setPriceEth(e.target.value)}
                  placeholder="0 = 免费"
                  disabled={stage !== 'idle'}
                />
                <div style={{ fontSize: 11, color: 'var(--fg-5)', marginTop: 4 }}>
                  填 0 即免费模板，创作者获得 100% 收益，无平台抽成。
                </div>
              </div>
            </div>

            {/* Progress */}
            {stage !== 'idle' && (
              <div style={{ padding: '12px 14px', background: 'var(--bg-elev-2)', borderRadius: 8, fontSize: 12 }}>
                <div style={{ color: stage === 'uploading' ? '#60a5fa' : 'var(--fg-4)' }}>
                  {stage === 'uploading' ? '⏳ 上传 YAML 到 0G Storage…' : '✅ 上传完成'}
                </div>
                {cid && (
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--fg-5)', marginTop: 3, wordBreak: 'break-all' }}>
                    CID: {cid}
                  </div>
                )}
                {stage === 'publishing' && (
                  <div style={{ color: '#a78bfa', marginTop: 6 }}>⏳ 链上注册中（MetaMask 确认）…</div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#fca5a5' }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                disabled={stage === 'uploading' || stage === 'publishing'}
                style={{
                  padding: '8px 18px', borderRadius: 8,
                  background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
                  color: 'var(--fg-3)', fontSize: 13, cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handlePublish}
                disabled={stage === 'uploading' || stage === 'publishing' || nodeCount === 0}
                style={{
                  padding: '8px 22px', borderRadius: 8,
                  background: stage === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.18)',
                  border: `1px solid ${stage === 'error' ? 'rgba(239,68,68,0.35)' : 'rgba(139,92,246,0.4)'}`,
                  color: stage === 'error' ? '#fca5a5' : '#c4b5fd',
                  fontSize: 13, fontWeight: 700,
                  cursor: (stage === 'uploading' || stage === 'publishing' || nodeCount === 0) ? 'not-allowed' : 'pointer',
                }}
              >
                {stage === 'idle' || stage === 'error' ? '上架到市场' :
                 stage === 'uploading' ? '上传中…' : '发布中…'}
              </button>
            </div>
          </>
        ) : (
          /* Success state */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '10px 0 6px' }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#4ade80' }}>模板发布成功！</div>
            <div style={{ fontSize: 12, color: 'var(--fg-4)', textAlign: 'center' }}>
              模板已上链，现在买家可以在市场中搜索并购买。
            </div>
            {templateId && (
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--fg-5)', wordBreak: 'break-all', textAlign: 'center' }}>
                Template ID: {templateId}
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                marginTop: 6, padding: '9px 28px', borderRadius: 8,
                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                color: '#4ade80', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
