/**
 * NeoPlusMenu 组件行为测试 — 2026-11-07 重做（ClawHub 入口移除 → 技能 /
 * 连接器 两入口，WorkBuddy 形态）。锁住：
 *   - Layer 1 只有「技能 / 连接器」两行，ClawHub 行不复存在
 *   - 连接器面板：列表渲染 + 状态点 + 多选 toggle 回调 + 选中 ✓
 *   - 技能面板：全量目录（GET /api/skills）卡片（monogram + 描述）、停用过滤、
 *     选 skill 回调 + 关闭、底部「从本地添加技能 / 管理技能」
 *   - Esc 关闭、底部「管理连接器」动作
 */
import { render, screen, fireEvent } from '../../test/utils';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../api/skillIngest', () => ({
  extractSkillUrl: vi.fn(() => null),
  ingestSkill: vi.fn(),
  previewSkill: vi.fn(),
  listInstalledSkills: vi.fn().mockResolvedValue([
    {
      id: 'bmad-method',
      name: 'BMAD 方法',
      source: 'builtin',
      counts: { files: 3, bytes: 100 },
    },
  ]),
}));
vi.mock('../../api/connectors', () => ({
  listConnectors: vi.fn().mockResolvedValue({
    scanned_at: '2026-11-07T00:00:00Z',
    items: [
      {
        id: 'hermes',
        kind: 'acp',
        name: 'hermes',
        binary: 'hermes',
        transport: 'stdio',
        installed: true,
        status: 'connected',
        last_checked: '2026-11-07T00:00:00Z',
        policy: { enabled: true, approval_mode: 'auto' },
      },
      {
        id: 'figma-mcp',
        kind: 'mcp',
        name: 'figma-mcp',
        binary: 'figma-mcp',
        transport: 'unreachable',
        installed: false,
        status: 'disconnected',
        last_checked: '2026-11-07T00:00:00Z',
        policy: { enabled: true, approval_mode: 'auto' },
      },
    ],
  }),
}));
vi.mock('../../api/memoryBank', () => ({
  listPacks: vi.fn().mockResolvedValue({ data: { packs: [] } }),
}));
vi.mock('../../api/skills', () => ({
  // 技能面板数据源 = GET /api/skills 全量目录（内置能力技能 + 用户技能）。
  listSkills: vi.fn().mockResolvedValue([
    {
      skill_id: 'bmad-method',
      name: 'BMAD 方法',
      description: 'BMAD 需求拆解流水线',
      mode: 'blueprint',
      preview_type: 'yaml',
      source: 'builtin',
      enabled: true,
    },
    {
      skill_id: 'media-generation',
      name: '媒体生成',
      description: '文生图 / 文生视频 / 3D 生成能力技能',
      mode: 'blueprint',
      preview_type: 'yaml',
      source: 'builtin',
      enabled: true,
    },
    {
      skill_id: 'off-skill',
      name: '停用技能',
      description: '已停用不可选',
      mode: 'blueprint',
      preview_type: 'yaml',
      source: 'user',
      enabled: false,
    },
  ]),
}));
vi.mock('../../api/fsBrowse', () => ({
  fsHome: vi.fn(),
  fsList: vi.fn(),
  fsPickNative: vi.fn(),
}));
vi.mock('../../api/asr', () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock('../../common/constants/modelPicker', () => ({
  fetchPickerCliItems: vi.fn().mockResolvedValue([]),
  fetchPickerApiItems: vi.fn().mockResolvedValue([]),
  loadCachedPicker: vi.fn().mockReturnValue(null),
  saveCachedPicker: vi.fn(),
  pickerLabel: vi.fn((v: unknown) => String(v)),
}));

import { NeoPlusMenu } from '../NeoComposer';

function setup(props: Partial<React.ComponentProps<typeof NeoPlusMenu>> = {}) {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const anchorRef = { current: anchor };
  const onPickSkill = vi.fn();
  const onOpenSkillPicker = vi.fn();
  const onToggleConnector = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <NeoPlusMenu
        anchorRef={anchorRef}
        onClose={onClose}
        onPickSkill={onPickSkill}
        onOpenSkillPicker={onOpenSkillPicker}
        onToggleConnector={onToggleConnector}
        selectedConnectorIds={props.selectedConnectorIds ?? []}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onPickSkill, onOpenSkillPicker, onToggleConnector, onClose };
}

describe('NeoPlusMenu（2026-11-07 重做：技能 / 连接器）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Layer 1 只有「技能 / 连接器」两行，ClawHub 行已移除', () => {
    setup();
    expect(screen.getByTestId('neo-plus-row-skill')).toBeInTheDocument();
    expect(screen.getByTestId('neo-plus-row-connector')).toBeInTheDocument();
    expect(screen.queryByTestId('neo-plus-row-claw')).toBeNull();
    expect(screen.queryByTestId('neo-plus-sub-claw')).toBeNull();
  });

  it('连接器面板：列表 + 状态点 + 多选 toggle 回调', async () => {
    const { onToggleConnector } = setup();
    fireEvent.click(screen.getByTestId('neo-plus-row-connector'));
    const hermes = await screen.findByTestId('neo-plus-connector-hermes');
    expect(screen.getByTestId('neo-plus-connector-figma-mcp')).toBeInTheDocument();
    // connected 状态点亮
    expect(hermes.querySelector('.neo-plus-item-dot.on')).not.toBeNull();
    fireEvent.click(hermes);
    expect(onToggleConnector).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hermes', kind: 'acp' }),
    );
    // 未选中 → 无 ✓
    expect(hermes.querySelector('.neo-plus-item-check')).toBeNull();
  });

  it('已选连接器显示 ✓（selectedConnectorIds 驱动）', async () => {
    setup({ selectedConnectorIds: ['hermes'] });
    fireEvent.click(screen.getByTestId('neo-plus-row-connector'));
    const hermes = await screen.findByTestId('neo-plus-connector-hermes');
    expect(hermes.querySelector('.neo-plus-item-check')).not.toBeNull();
    expect(hermes.className).toContain('on');
  });

  it('技能面板：选 skill → onPickSkill + 关闭', async () => {
    const { onPickSkill, onClose } = setup();
    fireEvent.click(screen.getByTestId('neo-plus-row-skill'));
    const row = await screen.findByTestId('neo-plus-skill-bmad-method');
    fireEvent.click(row);
    expect(onPickSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bmad-method', name: 'BMAD 方法' }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('技能面板与后端目录对齐：内置能力技能可见，卡片含 monogram + 描述', async () => {
    setup();
    fireEvent.click(screen.getByTestId('neo-plus-row-skill'));
    const row = await screen.findByTestId('neo-plus-skill-media-generation');
    expect(row.textContent).toContain('媒体生成');
    expect(row.textContent).toContain('文生图');
    // WorkBuddy 形态卡片：monogram 色块
    expect(row.querySelector('.neo-plus-item-mono')).not.toBeNull();
  });

  it('已停用技能不进选取列表', async () => {
    setup();
    fireEvent.click(screen.getByTestId('neo-plus-row-skill'));
    await screen.findByTestId('neo-plus-skill-bmad-method');
    expect(screen.queryByTestId('neo-plus-skill-off-skill')).toBeNull();
  });

  it('底部「从本地添加技能」→ 打开 SkillPicker + 关闭', async () => {
    const { onOpenSkillPicker, onClose } = setup();
    fireEvent.click(screen.getByTestId('neo-plus-row-skill'));
    fireEvent.click(await screen.findByTestId('neo-plus-skill-add-local'));
    expect(onOpenSkillPicker).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('底部「管理技能」→ 关闭菜单', async () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByTestId('neo-plus-row-skill'));
    fireEvent.click(await screen.findByTestId('neo-plus-skill-manage'));
    expect(onClose).toHaveBeenCalled();
  });

  it('底部「管理连接器」→ 关闭菜单', async () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByTestId('neo-plus-row-connector'));
    fireEvent.click(await screen.findByTestId('neo-plus-connectors-manage'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc 关闭菜单', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
