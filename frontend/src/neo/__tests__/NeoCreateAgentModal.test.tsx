/**
 * NeoCreateAgentModal「一句话生成人设」测试（六层能力第二轮 B）。
 * mock ../api/llm（generateAgentPersona）+ ../api/agents（quickCreateAgent）：
 *   1. 老路径：只填名称直接创建 → soul 回落为同名，不触 LLM；
 *   2. 生成成功：persona 回填到可编辑 textarea，提交 soul 用生成内容；
 *   3. 生成失败：红条 + textarea 展开为手输，手输后提交 soul 用手输内容；
 *   4. 生成失败后仍只填名称也能创建（降级不阻塞）。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LlmApiError } from '../../api/llm';

const generateMock = vi.fn();
const quickCreateMock = vi.fn();

vi.mock('../../api/llm', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../api/llm')>();
  return { ...orig, generateAgentPersona: (...args: unknown[]) => generateMock(...args) };
});

vi.mock('../../api/agents', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../api/agents')>();
  return { ...orig, quickCreateAgent: (...args: unknown[]) => quickCreateMock(...args) };
});

import { NeoCreateAgentModal } from '../NeoCreateAgentModal';

function renderModal(onCreated = vi.fn()) {
  return {
    onCreated,
    ...render(
      <NeoCreateAgentModal workspaceId="ws1" onClose={vi.fn()} onCreated={onCreated} />,
    ),
  };
}

beforeEach(() => {
  generateMock.mockReset();
  quickCreateMock.mockReset();
  quickCreateMock.mockResolvedValue({ agent_id: 'a1', name: '小氢' });
});

describe('NeoCreateAgentModal 一句话生成人设', () => {
  it('老路径：只填名称创建，soul 回落为同名，不调 LLM', async () => {
    const { onCreated } = renderModal();
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '小氢' } });
    fireEvent.click(screen.getByTestId('neo-create-agent-submit'));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ agent_id: 'a1', name: '小氢' }));
    expect(generateMock).not.toHaveBeenCalled();
    expect(quickCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: '小氢', soul: '小氢', workspace_id: 'ws1' }),
    );
  });

  it('生成成功：persona 回填 textarea，提交 soul 用生成内容', async () => {
    generateMock.mockResolvedValue('## 角色定位\n氢能销售专家');
    const { onCreated } = renderModal();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '小氢' } });
    fireEvent.change(screen.getByTestId('neo-create-agent-desc'), {
      target: { value: '负责氢能重卡渠道开拓的销售专家' },
    });
    fireEvent.click(screen.getByTestId('neo-create-agent-generate'));

    const personaBox = await screen.findByTestId('neo-create-agent-persona');
    expect(generateMock).toHaveBeenCalledWith('负责氢能重卡渠道开拓的销售专家');
    expect((personaBox as HTMLTextAreaElement).value).toBe('## 角色定位\n氢能销售专家');

    fireEvent.click(screen.getByTestId('neo-create-agent-submit'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(quickCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ soul: '## 角色定位\n氢能销售专家' }),
    );
  });

  it('生成失败：红条提示 + textarea 展开手输，手输内容入库', async () => {
    generateMock.mockRejectedValue(new LlmApiError(401, null, 'NO_API_KEY'));
    renderModal();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '小氢' } });
    fireEvent.change(screen.getByTestId('neo-create-agent-desc'), { target: { value: '销售' } });
    fireEvent.click(screen.getByTestId('neo-create-agent-generate'));

    expect(await screen.findByTestId('neo-create-agent-gen-error')).toBeTruthy();
    const personaBox = (await screen.findByTestId('neo-create-agent-persona')) as HTMLTextAreaElement;
    fireEvent.change(personaBox, { target: { value: '手写人设：渠道销售' } });

    fireEvent.click(screen.getByTestId('neo-create-agent-submit'));
    await waitFor(() =>
      expect(quickCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ soul: '手写人设：渠道销售' }),
      ),
    );
  });

  it('生成失败后只填名称仍可创建（soul 同名，优雅降级不阻塞）', async () => {
    generateMock.mockRejectedValue(new LlmApiError(502, null, 'NETWORK_ERROR'));
    const { onCreated } = renderModal();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '小氢' } });
    fireEvent.change(screen.getByTestId('neo-create-agent-desc'), { target: { value: '销售' } });
    fireEvent.click(screen.getByTestId('neo-create-agent-generate'));
    await screen.findByTestId('neo-create-agent-gen-error');

    fireEvent.click(screen.getByTestId('neo-create-agent-submit'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(quickCreateMock).toHaveBeenCalledWith(expect.objectContaining({ soul: '小氢' }));
  });
});
