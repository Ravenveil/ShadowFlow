/**
 * groups-chat 的 agent 工具白名单（2026-11-20）。
 *
 * 为什么单独测这个小纯函数：它决定「论文团 agent 拿到哪些工具」，是两个
 * 安全开关的汇合点 ——
 *   1. 文件工具（read/write/edit/list/glob/grep）恒在：agent 要能产出文件，
 *      否则右侧产出面板永远是空的；
 *   2. remote_shell 只在设置里配好 SSH 主机后才出现：没配时给模型一个必然
 *      失败的工具，它只会反复重试烧 token。
 *
 * 同时锁住几条不该被后人顺手加进来的东西：shell_exec（本机无人看守的 shell）
 * 和网络/发信类工具都不在白名单里。
 */

import { describe, it, expect } from 'vitest';
import {
  AGENT_FILE_TOOL_NAMES,
  AGENT_REMOTE_TOOL_NAME,
  agentToolNames,
} from '../application/conversations/chat-orchestrator';

describe('agentToolNames', () => {
  it('未配置远端主机：只给文件工具', () => {
    const names = agentToolNames(false);
    expect(names).toEqual([...AGENT_FILE_TOOL_NAMES]);
    expect(names).not.toContain('remote_shell');
  });

  it('配置了远端主机：文件工具 + remote_shell', () => {
    const names = agentToolNames(true);
    expect(names).toContain('remote_shell');
    for (const f of AGENT_FILE_TOOL_NAMES) expect(names).toContain(f);
    expect(names).toHaveLength(AGENT_FILE_TOOL_NAMES.length + 1);
  });

  it('文件工具集合覆盖「写得出论文」的最小必需项', () => {
    for (const need of ['read_file', 'write_file', 'edit_file', 'list_dir']) {
      expect(AGENT_FILE_TOOL_NAMES).toContain(need);
    }
  });

  it('永远不含本机 shell_exec（群聊无审批通道，等于无人看守的 shell）', () => {
    expect(agentToolNames(true)).not.toContain('shell_exec');
    expect(agentToolNames(false)).not.toContain('shell_exec');
  });

  it('不含网络与外发类工具（避免 agent 自行外发数据/发信）', () => {
    const names = agentToolNames(true);
    for (const risky of ['fetch_url', 'web_search', 'send_email', 'im_send', 'github']) {
      expect(names).not.toContain(risky);
    }
  });

  it('远端工具名与内置表一致（改名时两边必须同步）', () => {
    expect(AGENT_REMOTE_TOOL_NAME).toBe('remote_shell');
  });
});
