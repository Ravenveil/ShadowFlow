/**
 * BuyView — 扫码购买页（2026-11-08 商品售卖列表，图2 参考版式）。
 *
 * 顾客扫商品二维码 → `#/buy/<product_id>`（App.tsx 哈希路由渲染本页，
 * 不进工作台）。真实数据流：
 *   拉商品（GET /api/craft-profit/products/:id，公开读）
 *   → 填收货人/手机/地址/备注 → POST /api/craft-profit/public/orders（落
 *     unpaid 待支付，扣库存）
 *   → 普通「支付」按钮（POST .../pay，演示支付）→ pending 待发货
 *   → 商家在生意看板「订单」页发货填快递单号（shipped）→ 标记完成（done）。
 * 待支付订单可取消（回补库存）。买家实付 = (单价 + 运费) × 件数。
 */
import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiFetch, chatAssetUrl } from "./chat-api";
import {
  cancelPublicOrder,
  payPublicOrder,
  postPublicOrder,
  type PublicOrderResult,
} from "./shop";
import "../product-app.css";

type BuyProduct = {
  id: string;
  name: string;
  subtitle: string;
  price_cents: number;
  market_price_cents: number;
  shipping_cents: number;
  stock: number;
  intro: string;
  images: string[];
  image_url: string;
  status: string;
  sold_units: number;
};

type PageState = "loading" | "ready" | "missing" | "error";

function fmtYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export default function BuyView({ productId }: { productId: string }) {
  const [state, setState] = useState<PageState>("loading");
  const [product, setProduct] = useState<BuyProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<PublicOrderResult | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setState("loading");
    apiFetch<BuyProduct>(`/api/craft-profit/products/${encodeURIComponent(productId)}`)
      .then((d) => {
        setProduct(d);
        setState("ready");
      })
      .catch((err) => {
        setState(err instanceof ApiError && err.status === 404 ? "missing" : "error");
      });
  }, [productId]);

  const unitTotal = product ? product.price_cents + product.shipping_cents : 0;
  const maxQty = product ? Math.max(1, Math.min(20, product.stock)) : 1;
  const soldOut = !!product && product.stock <= 0;
  const offShelf = !!product && product.status !== "active";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!product || submitting || soldOut || offShelf) return;
    setError("");
    if (!buyerName.trim()) {
      setError("请填写收货人姓名");
      return;
    }
    if (!address.trim()) {
      setError("请填写收货地址（省市区 + 详细地址）");
      return;
    }
    setSubmitting(true);
    try {
      const result = await postPublicOrder({
        product_id: product.id,
        qty,
        buyer_name: buyerName.trim(),
        buyer_contact: buyerContact.trim(),
        address: address.trim(),
        note: note.trim(),
      });
      setOrder(result);
      setPaid(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "下单太频繁了，请过一会儿再试"
          : err instanceof ApiError && err.status === 404
            ? "商品已被移除，无法下单"
            : err instanceof ApiError
              ? err.message
              : "下单失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** 普通支付按钮（演示支付）：点了就算付过，订单进待发货。 */
  async function pay() {
    if (!order || paying) return;
    setError("");
    setPaying(true);
    try {
      const updated = await payPublicOrder(order.order_id);
      setOrder(updated);
      setPaid(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "支付失败，请稍后重试");
    } finally {
      setPaying(false);
    }
  }

  async function cancelOrder() {
    if (!order || paying) return;
    setError("");
    try {
      await cancelPublicOrder(order.order_id);
      setOrder(null);
      setPaid(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "取消失败，请稍后重试");
    }
  }

  return (
    <div className="sf-buy-page">
      <header className="sf-buy-brand">
        <strong>ShadowFlow 小店</strong>
        <span>扫码购物 · 演示支付</span>
      </header>

      {state === "loading" && <p className="sf-buy-note">正在加载商品…</p>}
      {state === "missing" && <p className="sf-buy-note">商品不存在或已下架</p>}
      {state === "error" && null}

      {state === "ready" && product && (
        <section className="sf-buy-card">
          <div className="sf-buy-img">
            {product.image_url ? (
              <img src={chatAssetUrl(product.image_url)} alt={product.name} />
            ) : (
              <div className="sf-buy-img-ph">手工艺品</div>
            )}
          </div>
          <div className="sf-buy-info">
            <h1>{product.name}</h1>
            {product.subtitle ? <p className="sf-buy-tagline">{product.subtitle}</p> : null}

            <div className="sf-buy-price-box">
              <strong className="sf-buy-price">{fmtYuan(product.price_cents)}</strong>
              {product.market_price_cents > product.price_cents ? (
                <span className="sf-buy-market">
                  市场价 <s>{fmtYuan(product.market_price_cents)}</s> · 省{" "}
                  {Math.round(
                    (1 - product.price_cents / product.market_price_cents) * 100,
                  )}
                  %
                </span>
              ) : null}
            </div>

            <p className="sf-buy-meta">
              运费 {fmtYuan(product.shipping_cents)} · 库存 {product.stock} 件
              {product.sold_units > 0 ? ` · 已售 ${product.sold_units} 件` : ""}
            </p>

            {/* 付费引导提示（2026-11-08 下午）：货架收款码已撤，统一提示买家
                就在本链接页面完成支付。 */}
            {!offShelf && !(order && paid) ? (
              <p className="sf-buy-pay-tip">
                请在本链接页面完成支付：填写收货信息提交订单后，用微信扫码或点下方按钮付款即可。
              </p>
            ) : null}

            {/* 微信收款码（2026-11-08）：与货架同一张收款码放进商品链接页，
                收款金额实时对应应付合计（下单前 = 单价+运费 ×件数，
                下单后 = 订单合计），付完即隐藏。 */}
            {!offShelf && !(order && paid) ? (
              <div className="sf-buy-pay-qr">
                <img
                  src={`${import.meta.env.BASE_URL}wechat-pay-qr.png`}
                  alt="微信收款码"
                />
                <div className="sf-buy-pay-qr-txt">
                  <strong>微信扫码支付 {fmtYuan(order ? order.total_cents : unitTotal * qty)}</strong>
                  <small>
                    {order
                      ? `请按订单合计金额扫码支付（订单号 ${order.order_id}）`
                      : `收款金额 = ${fmtYuan(product.price_cents)} × ${qty} + 运费 ${fmtYuan(product.shipping_cents * qty)}`}
                  </small>
                </div>
              </div>
            ) : null}

            {offShelf ? (
              <p className="sf-buy-note">该商品已下架，看看别的吧</p>
            ) : order ? (
              <div className="sf-buy-success">
                <p className="sf-buy-success-t">{paid ? "✓ 支付成功" : "✓ 订单已创建"}</p>
                <p>
                  「{order.product_name}」× {order.qty}，合计 {fmtYuan(order.total_cents)}
                </p>
                <p className="sf-buy-sub">订单号 {order.order_id}</p>
                {paid ? (
                  <p className="sf-buy-sub">商家会尽快联系您安排发货</p>
                ) : (
                  <>
                    <p className="sf-buy-sub">订单待支付，点下方按钮完成付款</p>
                    {error ? <p className="sf-buy-err">{error}</p> : null}
                    <button
                      type="button"
                      className="sf-buy-submit"
                      onClick={() => void pay()}
                      disabled={paying}
                    >
                      {paying ? "支付中…" : `支付 ${fmtYuan(order.total_cents)}`}
                    </button>
                    <button type="button" className="sf-buy-cancel-link" onClick={() => void cancelOrder()}>
                      取消订单
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="sf-buy-again"
                  onClick={() => {
                    setOrder(null);
                    setPaid(false);
                    setQty(1);
                  }}
                >
                  再买一件
                </button>
              </div>
            ) : (
              <form className="sf-buy-form" onSubmit={submit}>
                <div className="sf-buy-row">
                  <span>数量</span>
                  <div className="sf-buy-qty">
                    <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="减少">
                      −
                    </button>
                    <em>{qty}</em>
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                      aria-label="增加"
                    >
                      +
                    </button>
                  </div>
                </div>
                <label className="sf-buy-row">
                  <span>收货人</span>
                  <input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="姓名"
                    maxLength={50}
                  />
                </label>
                <label className="sf-buy-row">
                  <span>手机号</span>
                  <input
                    value={buyerContact}
                    onChange={(e) => setBuyerContact(e.target.value)}
                    placeholder="手机号（可选，用于联系收货）"
                    maxLength={50}
                    inputMode="tel"
                  />
                </label>
                <label className="sf-buy-row sf-buy-row-top">
                  <span>收货地址</span>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="省市区 + 详细地址"
                    maxLength={500}
                    rows={2}
                  />
                </label>
                <label className="sf-buy-row">
                  <span>备注</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="备注（可选）例如：放门口 / 需要发票"
                    maxLength={200}
                  />
                </label>
                <div className="sf-buy-total">
                  <span>
                    合计
                    <small>
                      {" "}
                      {fmtYuan(product.price_cents)} × {qty} 件 + 运费{" "}
                      {fmtYuan(product.shipping_cents * qty)}
                    </small>
                  </span>
                  <strong>{fmtYuan(unitTotal * qty)}</strong>
                </div>
                {error ? <p className="sf-buy-err">{error}</p> : null}
                <button className="sf-buy-submit" type="submit" disabled={submitting || soldOut}>
                  {soldOut ? "已售罄" : submitting ? "提交中…" : `立即购买 · ${fmtYuan(unitTotal * qty)}`}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      <footer className="sf-buy-foot">商品由 ShadowFlow 手工艺品代销团队发货</footer>
    </div>
  );
}
