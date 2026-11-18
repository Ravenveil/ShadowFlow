/**
 * opc-pay.ts — OPC 支付网关（移植自 services/opc_pay.py）。
 *
 * 真实收款需要商户号（微信/支付宝都要求企业资质），个人无法申请，所以支付
 * 保持可切换网关设计，与 Python 同一套哲学：
 *   SF_PAY_MODE=simulated  (默认)  本地沙箱：确认即成功，演示可复现，不联网
 *   SF_PAY_MODE=wechat             需要 SF_WECHAT_MCHID / SF_WECHAT_APPID / SF_WECHAT_API_KEY
 *   SF_PAY_MODE=alipay             需要 SF_ALIPAY_APPID / SF_ALIPAY_PRIVATE_KEY
 */
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import type { Row } from './opc-store';

const SIMULATED = 'simulated';

/** 动态读取，便于测试改环境变量（模块级常量会固化）。 */
function env(name: string, defaultValue = ''): string {
  return (process.env[name] ?? defaultValue).trim();
}

export function mode(): string {
  return env('SF_PAY_MODE', 'simulated').toLowerCase();
}

export class PayNotConfigured extends Error {}

function configured(m: string): boolean {
  if (m === 'wechat') {
    return Boolean(env('SF_WECHAT_MCHID') && env('SF_WECHAT_APPID') && env('SF_WECHAT_API_KEY'));
  }
  if (m === 'alipay') {
    return Boolean(env('SF_ALIPAY_APPID') && env('SF_ALIPAY_PRIVATE_KEY'));
  }
  return true;
}

export function info(): Row {
  const m = mode();
  const ok = configured(m);
  let note: string;
  if (m === SIMULATED) {
    note = '本地沙箱：确认即视为支付成功，不产生真实扣款，适合演示与联调';
  } else if (ok) {
    note = `${m} 网关已配置商户信息，回调走 /api/opc/pay/notify`;
  } else {
    note = `${m} 网关缺少商户配置（需企业资质），调用下单会报 503`;
  }
  return {
    mode: m,
    configured: ok,
    real_money: m !== SIMULATED && ok,
    note,
  };
}

let _lanIpCache: string | null = null;

function lanIp(): Promise<string> {
  // Python socket UDP connect(8.8.8.8:80) 同构。沙箱/无网环境 connect 可能
  // 长时间挂起，8s 超时兜底回环地址（Python 侧 OSError 同样回 127.0.0.1）。
  // 结果缓存：同一进程内本地路由出口不变，避免每个 products/orders 请求
  // 都重跑一遍 connect（Python 每次 connect 也返回同一地址）。
  if (_lanIpCache) return Promise.resolve(_lanIpCache);
  return new Promise<string>((resolve) => {
    const s = new net.Socket();
    let settled = false;
    const done = (ip: string) => {
      if (settled) return;
      settled = true;
      try { s.destroy(); } catch { /* noop */ }
      _lanIpCache = ip;
      resolve(ip);
    };
    const timer = setTimeout(() => done('127.0.0.1'), 8000);
    timer.unref?.();
    s.once('error', () => done('127.0.0.1'));
    // UDP connect 不发包，只绑定本地路由出口地址
    s.connect(80, '8.8.8.8', () => {
      clearTimeout(timer);
      const addr = s.address() as net.AddressInfo;
      done(typeof addr === 'object' && addr ? addr.address : '127.0.0.1');
    });
  });
}

export async function publicBase(): Promise<string> {
  const explicit = env('SF_PUBLIC_BASE_URL').replace(/\/+$/, '');
  if (explicit) return explicit;
  const host = await lanIp();
  return `http://${host}:8787`;
}

export function createPayment(order: Row): Row {
  // Return a provider payment credential. Never charges anything by itself.
  const amount = Number(order.amount_cents);
  const m = mode();
  if (m === SIMULATED) {
    const txn = 'sim_' + crypto.randomBytes(7).toString('hex'); // 14 hex chars
    const payPath = `/q/pay/${order.id}`;
    return {
      provider: 'local-sandbox',
      mode: SIMULATED,
      txn_id: txn,
      qr_text: env('SF_PUBLIC_BASE_URL').replace(/\/+$/, '') + payPath,
      pay_path: payPath,
      amount_cents: amount,
      note: '沙箱支付：扫码后点「确认支付」即回调成功，不扣真实款项',
    };
  }

  if (!configured(m)) {
    throw new PayNotConfigured(
      `${m} 需要商户号（微信商户号/支付宝应用），个人主体无法申请。`
      + '演示请用 SF_PAY_MODE=simulated；或补齐环境变量后重试。',
    );
  }
  throw new PayNotConfigured(
    `${m} 下单接口尚未接入（需要商户证书与签名）。`
    + '订单状态机、回调路由 /api/opc/pay/notify 已就绪，接上即可用。',
  );
}

/** 注意：qr_text 需要 public_base()（async）；下单层先 await 再传进来。 */
export function createPaymentWithBase(order: Row, base: string): Row {
  const cred = createPayment(order);
  if (cred.mode === SIMULATED) {
    const payPath = cred.pay_path as string;
    return { ...cred, qr_text: base + payPath };
  }
  return cred;
}

export function verifyCallback(
  provider: string, payload: Row,
): [boolean, string, string, string] {
  if (provider === SIMULATED || provider === 'local-sandbox') {
    return [true, payload.txn_id || '', payload.order_id || '', ''];
  }
  if (provider === 'wechat') {
    const apiKey = env('SF_WECHAT_API_KEY');
    const raw = `${payload.out_trade_no ?? ''}${apiKey}`;
    const expected = crypto.createHash('md5').update(raw).digest('hex').toUpperCase();
    const ok = expected === String(payload.sign ?? '').toUpperCase();
    return [ok, payload.transaction_id ?? '', payload.out_trade_no ?? '', ok ? '' : '签名校验失败'];
  }
  if (provider === 'alipay') {
    const ok = Boolean(payload.trade_no) && Boolean(payload.out_trade_no);
    return [ok, payload.trade_no ?? '', payload.out_trade_no ?? '', ok ? '' : '缺少支付宝交易号'];
  }
  return [false, '', '', `未知支付渠道 ${provider}`];
}
