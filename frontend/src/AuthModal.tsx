/**
 * AuthModal.tsx — 登录 / 注册界面（沿袭介绍页 contact-modal 视觉语言）。
 *
 * 复用 index.css 全局类：.modal-backdrop / .contact-modal / .kicker /
 * .button-primary / .modal-close。补充样式见 product-app.css 的 .sf-auth-*。
 * 未登录不影响使用——弹窗里保留「以演示模式浏览」出口。
 */
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { authGuest, authLogin, authRegister } from "./auth";

type Mode = "login" | "register";

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  prefillEmail?: string;
}

export default function AuthModal({ open, onClose, initialMode = "login", prefillEmail = "" }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setEmail(prefillEmail);
      setPassword("");
      setName("");
      setError(null);
      setBusy(false);
      setDone(false);
    }
  }, [open, initialMode, prefillEmail]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await authRegister(email.trim(), password, name.trim() || undefined);
      } else {
        await authLogin(email.trim(), password);
      }
      setDone(true);
      window.setTimeout(onClose, 650);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  /** 游客一键体验：签发独立 guest 身份（token 持久化，24h 内续上数据）。 */
  const guest = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await authGuest();
      setDone(true);
      window.setTimeout(onClose, 650);
    } catch (err) {
      setError(err instanceof Error ? err.message : "游客登录失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onMouseDown={onClose}
    >
      <div className="contact-modal sf-auth-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X />
        </button>
        {done ? (
          <div className="success-state">
            <span>
              <Check />
            </span>
            <p>{mode === "register" ? "WELCOME" : "SIGNED IN"}</p>
            <h2>{mode === "register" ? "账号创建成功" : "登录成功"}</h2>
            <p>正在进入你的工作台…</p>
            <button className="button-primary" onClick={onClose}>
              开始使用
            </button>
          </div>
        ) : (
          <>
            <p className="kicker">{mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}</p>
            <h2 id="auth-modal-title">{mode === "register" ? "创建你的 ShadowFlow 账号" : "登录 ShadowFlow"}</h2>
            <p>
              {mode === "register"
                ? "注册后可同步工作空间、审批记录与知识库；不注册也可以演示模式浏览。"
                : "登录以继续你的工作空间；或以演示模式直接浏览。"}
            </p>

            <div className="sf-auth-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "on" : ""}
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                登录
              </button>
              <button
                role="tab"
                aria-selected={mode === "register"}
                className={mode === "register" ? "on" : ""}
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                注册
              </button>
            </div>

            <form onSubmit={submit}>
              {mode === "register" && (
                <label>
                  你的称呼
                  <input
                    value={name}
                    onChange={(e: FormEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
                    placeholder="怎么称呼你（可选）"
                    maxLength={80}
                  />
                </label>
              )}
              <label>
                邮箱
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e: FormEvent<HTMLInputElement>) => setEmail(e.currentTarget.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                />
              </label>
              <label>
                密码
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e: FormEvent<HTMLInputElement>) => setPassword(e.currentTarget.value)}
                  placeholder={mode === "register" ? "至少 8 位" : "你的密码"}
                  minLength={8}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
              </label>
              {error && <p className="sf-auth-error">{error}</p>}
              <button className="button-primary" type="submit" disabled={busy}>
                {busy ? "请稍候…" : mode === "register" ? "创建账号" : "登录"}
                {!busy && <ArrowRight size={17} />}
              </button>
            </form>

            <div className="sf-auth-foot">
              <button
                className="sf-auth-switch"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
              >
                {mode === "login" ? "还没有账号？立即注册" : "已有账号？去登录"}
              </button>
              <button className="sf-auth-demo" onClick={() => void guest()} disabled={busy}>
                游客一键体验
              </button>
              <button className="sf-auth-demo" onClick={onClose}>
                先以演示模式浏览
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
