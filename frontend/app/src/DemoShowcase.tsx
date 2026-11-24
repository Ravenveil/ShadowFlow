/**
 * DemoShowcase.tsx — 客户展示页 · 演示播放器（浅色主题）
 * 零依赖，直接 drop-in 使用。语义与主站 App.tsx 中 SampleDemo 一致。
 *
 * 用法：
 *   import DemoShowcase from "./DemoShowcase";
 *   <DemoShowcase title="暖手作工坊 · 手工编织手绳" />
 * （原交付为 .jsx，落库改 .tsx 仅为通过项目 strict 类型检查，内容与设计一致）
 */
import { useState, useEffect, useRef } from "react";

const C = {
  bg: "#f7f4ed",
  panel: "#fffdf8",
  card: "#ffffff",
  border: "#e6e0d0",
  borderSoft: "#e2dbcc",
  btnBorder: "#d5cec0",
  btnHover: "#efe9dd",
  text: "#17162d",
  textMid: "#77737d",
  textSoft: "#a29b8b",
  textFaint: "#b3ab99",
  textDesc: "#8a8272",
  accent: "#ff5e3a",
  accentHover: "#ff744f",
  teal: "#2aa89b",
  tealDark: "#1d9c90",
  green: "#45c17e",
  greenBg: "#c7efd9",
  greenText: "#1a7a4c",
};

const tones = {
  post: "#ec3a69",
  link: "#8e6cff",
  order: "#40d2c2",
  courier: "#f2b13c",
  profit: "#5ad18b",
};
const cardRoles: Record<keyof typeof tones, string> = {
  post: "内容官",
  link: "上架专员",
  order: "订单跟踪",
  courier: "物流协调",
  profit: "财务结算",
};

type DemoEvent =
  | { kind: "ceo"; text: string }
  | { kind: "user"; text: string; chips: string[] }
  | { kind: "note"; text: string }
  | { kind: "team"; members: [string, string][] }
  | { kind: "card"; tone: keyof typeof tones; title: string; detail: string }
  | { kind: "done"; text: string };

const demoEvents: DemoEvent[] = [
  { kind: "ceo", text: "你好，我是 董事长 👋 想帮你的作品找到更多买家。请把产品发给我——文字介绍、产品图片或产品文档都可以。" },
  {
    kind: "user",
    text: "暖手作工坊 · 手工编织手绳。纯手工编织，3 种配色，每一条都是手艺人亲手做的。",
    chips: ["手绳实拍 ×2", "产品说明书.pdf"],
  },
  { kind: "note", text: "已自动同步 3 份资料到知识库（文字、图片、文档全部解析入库，团队随时调用）" },
  { kind: "ceo", text: "资料已入库，产品要点已提取。正在为你组建专属 Agent 团队——" },
  {
    kind: "team",
    members: [
      ["内容官", "媒体平台发帖介绍"],
      ["上架专员", "生成并上架商品链接"],
      ["订单跟踪", "同步订单状态"],
      ["物流协调", "联系快递员寄出商品"],
      ["财务结算", "同步盈利情况"],
    ],
  },
  { kind: "card", tone: "post", title: "已发布 2 条媒体帖子", detail: "小红书《这条手绳，织进了阳光》· 抖音《30 秒看一条手绳的诞生》" },
  { kind: "card", tone: "link", title: "商品链接已生成并上架", detail: "「暖手作 · 手工编织手绳」¥39 / 条 · 已同步平台商品库" },
  { kind: "card", tone: "order", title: "新订单 ×3，状态已同步", detail: "小红书 ×2 · 抖音 ×1 · 自动确认，打开平台即可查看" },
  { kind: "card", tone: "courier", title: "已联系快递员上门取件", detail: "顺丰 SF1357**** · 预计 2 天送达 · 物流状态实时回传平台" },
  { kind: "card", tone: "profit", title: "盈利情况已同步", detail: "销售额 ¥117 · 成本与运费 ¥38 · 净利 ¥79" },
  { kind: "done", text: "全流程跑通 ✅ 商品、帖子、订单、快递与盈利已实时同步到你的平台——你只需要，继续做手绳。" },
];

const demoMetrics = [
  { key: "kb", label: "知识库资料", value: "3 份", at: 2 },
  { key: "team", label: "Agent 团队", value: "6 人", at: 4 },
  { key: "post", label: "媒体发帖", value: "2 条", at: 5 },
  { key: "link", label: "商品链接", value: "1 件", at: 6 },
  { key: "order", label: "同步订单", value: "3 单", at: 7 },
  { key: "ship", label: "快递在途", value: "1 件", at: 8 },
  { key: "profit", label: "净利同步", value: "¥79", at: 9 },
];

/* ---------- 事件卡渲染 ---------- */
function EventView({ event, index }: { event: DemoEvent; index: number }) {
  const base = { animation: "spFade 0.35s ease both" } as const;
  if (event.kind === "ceo") {
    return (
      <div key={index} style={{ ...base, display: "flex", gap: 10, maxWidth: "88%" }}>
        <span style={{ width: 30, height: 30, flex: "none", display: "grid", placeItems: "center", border: "1px solid #17162d", background: C.accent, color: "#fff", fontSize: 13 }}>👔</span>
        <div style={{ padding: "11px 14px", border: `1px solid ${C.border}`, background: C.card }}>
          <small style={{ display: "block", marginBottom: 5, color: C.textSoft, font: '8px "DM Mono", monospace', letterSpacing: "0.12em" }}>董事长</small>
          <p style={{ margin: 0, color: C.textMid, fontSize: 12, lineHeight: 1.85 }}>{event.text}</p>
        </div>
      </div>
    );
  }
  if (event.kind === "user") {
    return (
      <div key={index} style={{ ...base, marginLeft: "auto", maxWidth: "88%", textAlign: "right" }}>
        <div style={{ display: "inline-block", padding: "11px 14px", border: "1px solid rgba(255,94,58,0.4)", background: "rgba(255,94,58,0.14)", textAlign: "left" }}>
          <small style={{ display: "block", marginBottom: 5, color: C.textSoft, font: '8px "DM Mono", monospace', letterSpacing: "0.12em" }}>用户 · 暖手作工坊</small>
          <p style={{ margin: 0, color: C.textMid, fontSize: 12, lineHeight: 1.85 }}>{event.text}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {event.chips.map((c) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", border: "1px solid #ddd6c6", borderRadius: 20, color: "#8e8778", fontSize: 9 }}>📎 {c}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (event.kind === "note") {
    return (
      <div key={index} style={{ ...base, alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", border: `1px dashed ${C.teal}`, borderRadius: 20, color: C.teal, fontSize: 10 }}>
        🗄 {event.text}
      </div>
    );
  }
  if (event.kind === "team") {
    return (
      <div key={index} style={{ ...base, padding: "13px 15px", border: "1px solid rgba(64,210,194,0.5)", background: "rgba(64,210,194,0.08)" }}>
        <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 7, color: C.tealDark, font: '500 10px "DM Mono", monospace', letterSpacing: "0.1em" }}>👥 Agent 团队已组建 · 任务自动分发</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 7, marginTop: 11 }}>
          {event.members.map(([role, duty]) => (
            <span key={role} style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "7px 10px", border: `1px solid ${C.border}`, background: C.card }}>
              <strong style={{ fontSize: 11 }}>{role}</strong>
              <small style={{ color: C.textSoft, fontSize: 9 }}>{duty}</small>
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (event.kind === "card") {
    return (
      <div key={index} style={{ ...base, display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 14px", border: `1px solid ${C.border}`, borderLeft: `3px solid ${tones[event.tone]}`, background: C.card }}>
        <span style={{ width: 28, height: 28, flex: "none", display: "grid", placeItems: "center", border: `1px solid ${tones[event.tone]}`, color: tones[event.tone], fontSize: 13 }}>●</span>
        <div style={{ flex: 1 }}>
          <small style={{ display: "block", color: C.textSoft, font: '8px "DM Mono", monospace', letterSpacing: "0.12em" }}>{cardRoles[event.tone]} · 已同步平台</small>
          <strong style={{ display: "block", marginTop: 4, fontSize: 12 }}>{event.title}</strong>
          <p style={{ margin: "4px 0 0", color: C.textDesc, fontSize: 10.5, lineHeight: 1.8 }}>{event.detail}</p>
        </div>
        <span style={{ marginLeft: "auto", flex: "none", color: C.green }}>✓</span>
      </div>
    );
  }
  return (
    <div key={index} style={{ ...base, alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 16px", border: `1px solid ${C.green}`, background: C.greenBg, color: C.greenText, fontSize: 11.5, fontWeight: 700 }}>
      ✓ {event.text}
    </div>
  );
}

/* ---------- 主组件 ---------- */
export default function DemoShowcase({ title = "暖手作工坊 · 手工编织手绳" }: { title?: string }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setStep((s) => {
        if (s >= demoEvents.length) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 1400);
    return () => clearInterval(t);
  }, [playing]);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [step]);

  const togglePlay = () => {
    if (step >= demoEvents.length) setStep(0);
    setPlaying((p) => !p);
  };

  const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: `1px solid ${C.btnBorder}`, background: "transparent", color: C.text, fontSize: 11, fontWeight: 700, cursor: "pointer" } as const;

  return (
    <div style={{ background: C.bg, padding: "40px 24px", fontFamily: "inherit" }}>
      <style>{`@keyframes spFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <div style={{ margin: "0 auto", maxWidth: 1060, border: `1px solid ${C.borderSoft}`, background: C.panel, color: C.text, boxShadow: "9px 9px 0 #ff5e3a" }}>
        {/* 顶栏 */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "13px 18px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.tealDark, font: '10px "DM Mono", monospace', letterSpacing: "0.16em" }}>● DEMO</span>
          <strong style={{ fontSize: 13, letterSpacing: "-0.02em" }}>{title}</strong>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...btn, borderColor: C.accent, background: C.accent, color: "#fff" }} onClick={togglePlay}>
              {playing ? "⏸ 暂停" : step >= demoEvents.length ? "▶ 重新播放" : step === 0 ? "▶ 播放演示" : "▶ 继续播放"}
            </button>
            <button style={{ ...btn, opacity: step >= demoEvents.length ? 0.35 : 1 }} disabled={step >= demoEvents.length} onClick={() => { setPlaying(false); setStep((s) => Math.min(s + 1, demoEvents.length)); }}>
              下一步
            </button>
            <button style={btn} onClick={() => { setPlaying(false); setStep(0); }}>↻ 重置</button>
            <small style={{ marginLeft: 6, color: C.textSoft, font: '10px "DM Mono", monospace' }}>第 {step} / {demoEvents.length} 步</small>
          </div>
        </div>
        {/* 主体 */}
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.65fr", minHeight: 430 }}>
          <div ref={streamRef} style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: 22, borderRight: `1px solid ${C.border}` }}>
            {demoEvents.slice(0, step).map((e, i) => <EventView key={i} event={e} index={i} />)}
            {step === 0 && <div style={{ margin: "auto", color: C.textFaint, font: '11px "DM Mono", monospace', letterSpacing: "0.12em" }}>点击「播放演示」开始 →</div>}
          </div>
          <aside style={{ display: "flex", flexDirection: "column", padding: "20px 18px" }}>
            <p style={{ margin: 0, color: C.textSoft, font: '500 9px "DM Mono", monospace', letterSpacing: "0.16em" }}>平台实时同步</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 14 }}>
              {demoMetrics.map((m) => {
                const on = step > m.at;
                return (
                  <div key={m.key} style={{ padding: "11px 12px", border: `1px solid ${on ? "#cfc7b5" : C.border}`, background: on ? C.card : "transparent", color: on ? C.text : C.textFaint, transition: "all 0.3s" }}>
                    <span style={{ fontSize: 13 }}>{on ? "▦" : "▢"}</span>
                    <small style={{ display: "block", marginTop: 7, fontSize: 9, opacity: 0.75 }}>{m.label}</small>
                    <strong style={{ display: "block", marginTop: 3, fontSize: 15 }}>{on ? m.value : "—"}</strong>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 7, paddingTop: 16, color: C.textSoft, fontSize: 10 }}>
              ⚡ {step >= demoEvents.length ? "全流程已跑通" : playing ? "Agent 团队执行中…" : step === 0 ? "待开始" : "已暂停"}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
