import { type CSSProperties } from 'react';

interface Product {
  name: string;
  x: number;
  y: number;
  highlight?: boolean;
}

const PRODUCTS: Product[] = [
  { name: 'ShadowFlow', x: 78, y: 18, highlight: true },
  { name: 'N8N', x: 30, y: 25 },
  { name: 'Dify', x: 35, y: 30 },
  { name: 'LangGraph', x: 72, y: 72 },
  { name: 'AutoGen', x: 68, y: 78 },
  { name: 'CrewAI', x: 78, y: 82 },
  { name: 'ChatGPT', x: 22, y: 80 },
  { name: 'Cherry Studio', x: 28, y: 75 },
];

const QUADRANT_LABELS: { text: string; x: number; y: number }[] = [
  { text: '低代码编排\n本地托管', x: 25, y: 25 },
  { text: '真协作团队\n链上资产', x: 75, y: 25 },
  { text: '单体对话\n本地会话', x: 25, y: 75 },
  { text: '多 Agent 框架\n本地部署', x: 75, y: 75 },
];

const W = 560;
const H = 440;
const PAD = 60;
const CX = W / 2;
const CY = H / 2;

function toSvgX(pct: number) {
  return PAD + ((pct / 100) * (W - PAD * 2));
}
function toSvgY(pct: number) {
  return PAD + ((pct / 100) * (H - PAD * 2));
}

export default function QuadrantChart({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={style}
      role="img"
      aria-label="ShadowFlow 四维象限定位图：横轴从单 Agent 到多 Agent 协作，纵轴从有状态本地到链上可传承"
    >
      {/* quadrant background fills */}
      <rect x={PAD} y={PAD} width={CX - PAD} height={CY - PAD} fill="#A855F710" rx={4} />
      <rect x={CX} y={PAD} width={W - PAD - CX} height={CY - PAD} fill="#A855F720" rx={4} />
      <rect x={PAD} y={CY} width={CX - PAD} height={H - PAD - CY} fill="#FFFFFF05" rx={4} />
      <rect x={CX} y={CY} width={W - PAD - CX} height={H - PAD - CY} fill="#FFFFFF08" rx={4} />

      {/* axes */}
      <line x1={PAD} y1={CY} x2={W - PAD} y2={CY} stroke="#3F3F46" strokeWidth={1} />
      <line x1={CX} y1={PAD} x2={CX} y2={H - PAD} stroke="#3F3F46" strokeWidth={1} />

      {/* axis labels */}
      <text x={PAD + 4} y={CY - 6} fill="#71717A" fontSize={10} fontFamily="var(--font-mono)">
        单 Agent
      </text>
      <text x={W - PAD - 4} y={CY - 6} fill="#71717A" fontSize={10} fontFamily="var(--font-mono)" textAnchor="end">
        多 Agent 协作
      </text>
      <text x={CX + 6} y={PAD + 12} fill="#71717A" fontSize={10} fontFamily="var(--font-mono)">
        链上可传承
      </text>
      <text x={CX + 6} y={H - PAD - 4} fill="#71717A" fontSize={10} fontFamily="var(--font-mono)">
        有状态本地
      </text>

      {/* quadrant labels (subtle) */}
      {QUADRANT_LABELS.map((q) => (
        <text
          key={q.text}
          x={toSvgX(q.x)}
          y={toSvgY(q.y)}
          fill="#52525B"
          fontSize={11}
          fontFamily="var(--font-sans)"
          textAnchor="middle"
        >
          {q.text.split('\n').map((line, i) => (
            <tspan key={i} x={toSvgX(q.x)} dy={i === 0 ? 0 : 14}>
              {line}
            </tspan>
          ))}
        </text>
      ))}

      {/* product dots */}
      {PRODUCTS.map((p) => {
        const sx = toSvgX(p.x);
        const sy = toSvgY(p.y);
        if (p.highlight) {
          return (
            <g key={p.name}>
              <circle cx={sx} cy={sy} r={20} fill="#A855F718" />
              <circle cx={sx} cy={sy} r={6} fill="#A855F7" />
              <text
                x={sx}
                y={sy - 12}
                fill="#D8B4FE"
                fontSize={13}
                fontWeight={700}
                fontFamily="var(--font-sans)"
                textAnchor="middle"
              >
                {p.name}
              </text>
            </g>
          );
        }
        return (
          <g key={p.name}>
            <circle cx={sx} cy={sy} r={3.5} fill="#71717A" />
            <text
              x={sx}
              y={sy - 8}
              fill="#A1A1AA"
              fontSize={11}
              fontFamily="var(--font-sans)"
              textAnchor="middle"
            >
              {p.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
