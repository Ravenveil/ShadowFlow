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

import base64
import hashlib
import time
import uuid

from .config import (
    ALIPAY_APPID,
    ALIPAY_PRIVATE_KEY,
    ALIPAY_PUBLIC_KEY,
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
        # 支付页地址带上订单访问凭据：单号可枚举，凭据不可猜。
        key = order.get("access_key") or ""
        pay_path = f"/q/pay/{order['id']}" + (f"?k={key}" if key else "")
        return {
            "provider": "local-sandbox",
            "mode": SIMULATED,
            "txn_id": txn,
            "qr_text": public_base() + pay_path,
            "pay_path": pay_path,
            "amount_cents": amount,
            "amount": round(amount / 100, 2),
            "amount_text": f"¥{amount / 100:.2f}".rstrip("0").rstrip("."),
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


def _wechat_sign(payload):
    """微信支付 APIv2 签名：按参数名字典序拼 k=v，末尾接 &key=API_KEY，再取 MD5 大写。

    旧实现只拼了 out_trade_no，任何人换个单号就能算出「合法」签名 —— 那不是验签。
    """
    items = [
        f"{k}={v}"
        for k, v in payload.items()
        if k != "sign" and v is not None and str(v) != ""
    ]
    raw = "&".join(sorted(items)) + f"&key={WECHAT_API_KEY}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest().upper()


def _rsa_verify_alipay(payload):
    """支付宝 RSA2 验签。缺公钥时明确拒绝，绝不降级成「字段齐全即通过」。"""
    if not ALIPAY_PUBLIC_KEY:
        return False, "未配置 SF_ALIPAY_PUBLIC_KEY，无法验签"
    sign = payload.get("sign") or ""
    if not sign:
        return False, "缺少 sign"
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        content = "&".join(
            f"{k}={v}"
            for k, v in sorted(payload.items())
            if k not in ("sign", "sign_type") and v is not None and str(v) != ""
        )
        pub = serialization.load_pem_public_key(ALIPAY_PUBLIC_KEY.encode("utf-8"))
        pub.verify(
            base64.b64decode(sign),
            content.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True, ""
    except ImportError:
        return False, "服务端未安装 cryptography，无法验签"
    except Exception as exc:  # noqa: BLE001
        return False, f"验签失败：{type(exc).__name__}"


def verify_callback(provider, payload, order=None):
    """Validate a gateway callback. Returns (ok, txn_id, order_id, reason).

    order 是库里的订单记录。沙箱模式必须比对两样服务端签发的东西：
      - pay_txn_id（下单时生成，回调必须原样带回）
      - access_key（只发给下单的那位买家）
    单号本身可枚举，所以「带着单号来」不能作为付款凭证。
    """
    order_id = payload.get("order_id") or payload.get("out_trade_no") or ""
    txn_id = payload.get("txn_id") or payload.get("transaction_id") or payload.get("trade_no") or ""

    if provider in (SIMULATED, "local-sandbox"):
        if not order:
            return False, "", order_id, "订单不存在"
        expected_txn = order.get("pay_txn_id") or ""
        expected_key = order.get("access_key") or ""
        if not expected_txn:
            return False, "", order_id, "该订单未签发支付凭据"
        if str(txn_id) != expected_txn:
            return False, "", order_id, "支付凭据与订单不匹配"
        if expected_key and str(payload.get("access_key") or "") != expected_key:
            return False, "", order_id, "缺少订单访问凭据"
        return True, txn_id, order_id, ""

    if provider == "wechat":
        if not WECHAT_API_KEY:
            return False, "", order_id, "未配置 SF_WECHAT_API_KEY，无法验签"
        expected = _wechat_sign(payload)
        ok = expected == str(payload.get("sign") or "").upper()
        return ok, txn_id, order_id, "" if ok else "签名校验失败"

    if provider == "alipay":
        ok, reason = _rsa_verify_alipay(payload)
        return ok, txn_id, order_id, "" if ok else reason

    return False, "", order_id, f"未知支付渠道 {provider}"


def settle_delay():
    """Sandbox needs no settlement wait; a real gateway settles asynchronously."""
    return 0.0 if PAY_MODE == SIMULATED else float(time.time() * 0)
