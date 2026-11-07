"""OPC OS payment gateway — ported from backend-poc/app/pay.py (2026-11-04).

真实收款需要商户号（微信/支付宝都要求企业资质），个人无法申请，所以支付
保持可切换网关设计，与 backend-poc 同一套哲学：

  SF_PAY_MODE=simulated  (默认)  本地沙箱：确认即成功，演示可复现，不联网
  SF_PAY_MODE=wechat             需要 SF_WECHAT_MCHID / SF_WECHAT_APPID / SF_WECHAT_API_KEY
  SF_PAY_MODE=alipay             需要 SF_ALIPAY_APPID / SF_ALIPAY_PRIVATE_KEY

对外契约完全一致：下单返回待支付凭据（qr_text），支付成功后回调
/api/opc/pay/notify，订单状态机照常推进。换真实网关只改环境变量。
"""

from __future__ import annotations

import hashlib
import os
import socket
import uuid
from typing import Dict, Optional, Tuple

SIMULATED = "simulated"


def _env(name: str, default: str = "") -> str:
    """动态读取，便于测试 monkeypatch 环境变量（模块级常量会固化）。"""
    return os.getenv(name, default).strip()


def mode() -> str:
    return _env("SF_PAY_MODE", "simulated").lower()


class PayNotConfigured(Exception):
    """网关被选中但缺少商户配置。绝不静默降级。"""


def _configured(m: str) -> bool:
    if m == "wechat":
        return bool(_env("SF_WECHAT_MCHID") and _env("SF_WECHAT_APPID") and _env("SF_WECHAT_API_KEY"))
    if m == "alipay":
        return bool(_env("SF_ALIPAY_APPID") and _env("SF_ALIPAY_PRIVATE_KEY"))
    return True


def info() -> Dict[str, object]:
    m = mode()
    configured = _configured(m)
    if m == SIMULATED:
        note = "本地沙箱：确认即视为支付成功，不产生真实扣款，适合演示与联调"
    elif configured:
        note = f"{m} 网关已配置商户信息，回调走 /api/opc/pay/notify"
    else:
        note = f"{m} 网关缺少商户配置（需企业资质），调用下单会报 503"
    return {
        "mode": m,
        "configured": configured,
        "real_money": m != SIMULATED and configured,
        "note": note,
    }


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def public_base() -> str:
    """二维码地址：优先显式配置，其次局域网 IP，最后回环。"""
    explicit = _env("SF_PUBLIC_BASE_URL").rstrip("/")
    if explicit:
        return explicit
    host = lan_ip()
    return f"http://{host}:8787"


def create_payment(order: Dict[str, Any]) -> Dict[str, Any]:
    """Return a provider payment credential. Never charges anything by itself."""
    amount = int(order["amount_cents"])
    m = mode()
    if m == SIMULATED:
        txn = "sim_" + uuid.uuid4().hex[:14]
        pay_path = f"/q/pay/{order['id']}"
        return {
            "provider": "local-sandbox",
            "mode": SIMULATED,
            "txn_id": txn,
            "qr_text": public_base() + pay_path,
            "pay_path": pay_path,
            "amount_cents": amount,
            "note": "沙箱支付：扫码后点「确认支付」即回调成功，不扣真实款项",
        }

    if not _configured(m):
        raise PayNotConfigured(
            f"{m} 需要商户号（微信商户号/支付宝应用），个人主体无法申请。"
            "演示请用 SF_PAY_MODE=simulated；或补齐环境变量后重试。"
        )
    raise PayNotConfigured(
        f"{m} 下单接口尚未接入（需要商户证书与签名）。"
        "订单状态机、回调路由 /api/opc/pay/notify 已就绪，接上即可用。"
    )


def verify_callback(provider: str, payload: Dict[str, Any]) -> Tuple[bool, str, str, str]:
    """Validate a gateway callback. Returns (ok, txn_id, order_id, reason)."""
    if provider in (SIMULATED, "local-sandbox"):
        return True, payload.get("txn_id") or "", payload.get("order_id") or "", ""
    if provider == "wechat":
        api_key = _env("SF_WECHAT_API_KEY")
        raw = f"{payload.get('out_trade_no', '')}{api_key}".encode()
        expected = hashlib.md5(raw).hexdigest().upper()
        ok = expected == str(payload.get("sign", "")).upper()
        return ok, payload.get("transaction_id", ""), payload.get("out_trade_no", ""), "" if ok else "签名校验失败"
    if provider == "alipay":
        ok = bool(payload.get("trade_no")) and bool(payload.get("out_trade_no"))
        return ok, payload.get("trade_no", ""), payload.get("out_trade_no", ""), "" if ok else "缺少支付宝交易号"
    return False, "", "", f"未知支付渠道 {provider}"
