/**
 * commands.ts — 输入框的斜杠命令表。
 *
 * 这些命令是**纯客户端行为**（插模板 / 清空 / 打开帮助），后端不认识，
 * 所以既不属于 mock 数据也不属于后端契约；mock 与 http 两条路共用这一份。
 * 想加命令：在下面加一条，`/` 菜单会自动出现（组件不认具体命令）。
 */
import type { ComposerCommand } from '@/shared/data/types';

export const COMMANDS: ComposerCommand[] = [
  { id: 'clear', name: '/clear', desc: '清空输入框、附件与已选知识包', action: 'clear' },
  { id: 'help', name: '/help', desc: '查看快捷键与命令说明', action: 'help' },
  { id: 'inspect', name: '/inspect', desc: '跳到右栏看本轮执行记录', action: 'inspect' },
  {
    id: 'outline',
    name: '/outline',
    desc: '插入章节骨架指令',
    insert: '按以下结构生成章节骨架，并标出每节字数配比：',
  },
  {
    id: 'cite',
    name: '/cite',
    desc: '插入引用补齐指令',
    insert: '为下面这段补 3 条可核查引用（作者 · 年份 · 出处）：',
  },
  {
    id: 'review',
    name: '/review',
    desc: '插入交叉复核指令',
    insert: '交叉复核这版结论，逐条指出证据不足与口径风险：',
  },
  {
    id: 'figure',
    name: '/figure',
    desc: '插入配图说明指令',
    insert: '把这段改写成配图说明，注明数据来源与坐标含义：',
  },
  {
    id: 'polish',
    name: '/polish',
    desc: '插入文风统一指令',
    insert: '在不改变结论的前提下统一文风，删掉口语化表达：',
  },
];
