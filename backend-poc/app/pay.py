"""Payment gateway abstraction.

Why this file exists: 真实收款需要商户号。微信支付与支付宝的商户号都要求企业资质，
个人无法申请，因此「扫码付钱 -> 自动开工」这条链路在没有商户号的环境里跑不通。

所以支付被做成可切换网关，和 llm.py 的 simulated 模式同一套哲学：

  SF_PAY_MODE=simulated  (默认)  本地沙箱：确认即成功，演示可复现，不联网
  SF_PAY_MODE=wechat             需要 SF_WECHAT_MCHID / SF_WECHAT_APPID / SF_WECHAT_API_KEY
  SF_PAY_MODE=alipay             需要 SF_ALIPAY_APPID / SF_ALIPAY_PRIVATE_KEY

关键约束：不管哪个网关，对外契约完全一致 —— 下单返回一个待支付凭据（qr_text），
支付成功后回调 /api/pay/notify，订单状态机照常推进。换成真实网关时，前端页面、
订单表、编排器一行都不用改，只改这一个环境变量。
"""

import hashlib
import time
import uuid

from .config import (
    ALIPAY_APPID,
    ALIPAY_PRIVATE_KEY,
    PAY_MODE,
    PUBLIC_BASE_URL,
    WECHAT_API_KEY,
    WECHAT_APPID,
    WECHAT_MCHID,
)

SIMULATED = "simulated"


class PayNotConfigured(Exception):
    """网关被选中但缺少商户配置。绝不静默降级 —— 静默降级会让演示当场假成功。"""


def _configured(mode):
    if mode == "wechat":
        return bool(WECHAT_MCHID and WECHAT_APPID and WECHAT_API_KEY)
    if mode == "alipay":
        return bool(ALIPAY_APPID and ALIPAY_PRIVATE_KEY)
    return True


def mode():
    return PAY_MODE


def info():
    configured = _configured(PAY_MODE)
    if PAY_MODE == SIMULATED:
        note = "本地沙箱：确认即视为支付成功，不产生真实扣款，适合演示与联调"
    elif configured:
        note = f"{PAY_MODE} 网关已配置商户信息，回调走 /api/pay/notify"
    else:
        note = f"{PAY_MODE} 网关缺少商户配置（需企业资质），调用下单会报 503"
    return {
        "mode": PAY_MODE,
        "configured": configured,
        "real_money": PAY_MODE != SIMULATED and configured,
        "note": note,
    }


def _base():
    return PUBLIC_BASE_URL or ""


def lan_ip():
    """局域网 IP，用于让手机扫码打开本机页面（同一 WiFi 下）。"""
    import socket

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def public_base():
    """二维码里该写什么地址：优先显式配置，其次局域网 IP，最后回环。"""
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL
    from .config import HOST, PORT

    host = lan_ip() if HOST in ("0.0.0.0", "::") else "127.0.0.1"
    return f"http://{host}:{PORT}"


def create_payment(order):
    """Return a provider payment credential. Never charges anything by itself."""
    amount = int(order["amount_cents"])
    if PAY_MODE == SIMULATED:
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

    if not _configured(PAY_MODE):
        raise PayNotConfigured(
            f"{PAY_MODE} 需要商户号（微信商户号/支付宝应用），个人主体无法申请。"
            "演示请用 SF_PAY_MODE=simulated；或补齐环境变量后重试。"
        )

    # 真实网关：这里应当调用下单接口拿 code_url / 预支付 ID，再返回给前端生成二维码。
    # 当前实现保留完整回调契约，但未接入签名与 HTTPS 证书，故直接显式报错而不是假装成功。
    raise PayNotConfigured(
        f"{PAY_MODE} 下单接口尚未接入（需要商户证书与签名）。"
        "订单状态机、回调路由 /api/pay/notify 已就绪，接上即可用。"
    )


def verify_callback(provider, payload):
    """Validate a gateway callback. Returns (ok, txn_id, order_id, reason).

    provider 接受两种写法：模式名（simulated/wechat/alipay）或网关标识（local-sandbox），
    因为支付凭据里返回的是后者，而路由层用前者做分支。
    """
    if provider in (SIMULATED, "local-sandbox"):
        return True, payload.get("txn_id") or "", payload.get("order_id") or "", ""
    if provider == "wechat":
        # 真实场景：验证 Wechatpay-Signature + 平台证书 + 解密 resource
        raw = f"{payload.get('out_trade_no','')}{WECHAT_API_KEY}".encode()
        expected = hashlib.md5(raw).hexdigest().upper()
        ok = expected == str(payload.get("sign", "")).upper()
        return ok, payload.get("transaction_id", ""), payload.get("out_trade_no", ""), "" if ok else "签名校验失败"
    if provider == "alipay":
        ok = bool(payload.get("trade_no")) and bool(payload.get("out_trade_no"))
        return ok, payload.get("trade_no", ""), payload.get("out_trade_no", ""), "" if ok else "缺少支付宝交易号"
    return False, "", "", f"未知支付渠道 {provider}"


def settle_delay():
    """Sandbox needs no settlement wait; a real gateway settles asynchronously."""
    return 0.0 if PAY_MODE == SIMULATED else float(time.time() * 0)
