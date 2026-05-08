import { Bot, Users, Link2, Wrench, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Step {
  number: number;
  title: string;
  description: string;
  action?: { label: string; sectionId: string };
}

const STEPS: Step[] = [
  {
    number: 1,
    title: '选择执行后端',
    description: '在「执行后端」中选择本机已安装的 CLI Agent（Claude Code、Codex 等），或配置 BYOK API Key 直接调用模型。',
  },
  {
    number: 2,
    title: '配置 Composio 连接器',
    description: '在「Connectors」中输入 Composio API Key，即可让 Agent 访问 GitHub、Notion、Slack 等 250+ 工具。',
  },
  {
    number: 3,
    title: '注册 MCP 工具提供商',
    description: '在「Tool Providers」中注册 MCP 服务端（stdio/http/sse），为 Agent 扩展自定义工具能力。',
  },
  {
    number: 4,
    title: '创建第一个 Agent',
    description: '进入 Editor 页面，点击「+ Agent」开始创建 Agent，配置名称、能力和执行策略。',
  },
  {
    number: 5,
    title: '组建 Agent Team',
    description: '在 Team 视图中将多个 Agent 编排成工作流，设置协作模式和 Policy Matrix。',
  },
];

interface Feature {
  Icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { Icon: Bot,    title: 'Agent 工厂',        desc: '以「招人」思路创建 Agent，name + soul 即可上岗' },
  { Icon: Users,  title: 'Team 协作',          desc: 'Policy Matrix 管理多 Agent 协作权限' },
  { Icon: Link2,  title: 'ACP 原生',           desc: '基于 ACP 协议，兼容所有主流 CLI Agent' },
  { Icon: Wrench, title: '工具集成',            desc: 'Composio + MCP 双轨，250+ 工具开箱即用' },
];

export function WelcomeSection() {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="rounded-[16px] border border-sf-border bg-gradient-to-br from-sf-accent/10 to-sf-elev2 p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-sf-accent/15 text-sf-accent-bright">
            <Waves size={22} strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 className="text-[20px] font-bold text-sf-fg1">欢迎使用 ShadowFlow</h2>
            <p className="text-[12px] text-sf-fg4">Agent Team 的 VS Code · ACP 时代的工作流平台</p>
          </div>
        </div>
        <p className="text-[13px] text-sf-fg2 leading-relaxed">
          ShadowFlow 让你像管理员工一样组建 AI Agent 团队。每个 Agent 有名字、有性格、有专属工具，协同完成复杂任务。
        </p>
      </div>

      {/* Feature highlights */}
      <div>
        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">核心能力</p>
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-[10px] border border-sf-border bg-sf-elev2 p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sf-fg2"><f.Icon size={18} strokeWidth={2} aria-hidden /></span>
                <span className="text-[13px] font-semibold text-sf-fg1">{f.title}</span>
              </div>
              <p className="text-[11px] text-sf-fg4">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Getting started steps */}
      <div>
        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">快速上手</p>
        <div className="flex flex-col gap-2">
          {STEPS.map(step => (
            <div key={step.number} className="flex gap-3 rounded-[10px] border border-sf-border bg-sf-elev2 p-3.5">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-sf-accent/20 font-mono text-[11px] font-bold text-sf-accent-bright">
                {step.number}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-sf-fg1">{step.title}</p>
                <p className="mt-0.5 text-[11px] text-sf-fg4 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-center font-mono text-[10px] text-sf-fg5">
        Built with Claude Code · Powered by Anthropic · ACP Protocol
      </p>
    </div>
  );
}
