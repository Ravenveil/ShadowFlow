/**
 * shop — 扫码购买的链接与公开下单 API（2026-11-08 商品售卖列表）。
 *
 * 链接口径：二维码内容 = 商家当前访问地址 + `#/buy/<product_id>`（哈希路由
 * 不吃服务端重写，LAN IP / 隧道域名都能直接扫开）。下单走
 * POST /api/craft-profit/public/orders（公开接口，无 Bearer；见后端限流）。
 */
import { apiFetch } from "./chat-api";

/** 购买页哈希路由：#/buy/<productId>。 */
export function productBuyHash(productId: string): string {
  return `#/buy/${encodeURIComponent(productId)}`;
}

/**
 * 购买页绝对链接（二维码内容）。取当前 origin + pathname，
 * 保证 LAN IP / 隧道域名下扫出来的码指向同一个可访问地址。
 */
export function productBuyUrl(productId: string): string {
  const url = new URL(window.location.href);
  url.hash = productBuyHash(productId);
  url.search = "";
  return url.toString();
}

/** 从 location.hash 解析购买页商品 id；不是购买路由返回 null。 */
export function parseBuyHash(hash: string = window.location.hash): string | null {
  const m = /^#\/buy\/([^?#/]+)/.exec(hash ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

export interface PublicOrderInput {
  product_id: string;
  qty: number;
  buyer_name?: string;
  buyer_contact?: string;
  /** 收货地址（省市区 + 详细地址）/ 订单备注（放门口、要发票之类）。 */
  address?: string;
  note?: string;
}

export interface PublicOrderResult {
  order_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  price_cents: number;
  shipping_cents: number;
  /** 买家实付 = (单价 + 运费) × 件数。 */
  total_cents: number;
  status: string;
  paid_at: number | null;
  created_at: number;
  buyer_name: string;
  buyer_contact: string;
  address: string;
  note: string;
  express_company: string;
  tracking: string;
}

/** 顾客扫码下单（公开接口，落 unpaid 待支付）。错误抛 ApiError（429 限流 / 404 商品不存在等）。 */
export async function postPublicOrder(input: PublicOrderInput): Promise<PublicOrderResult> {
  const json = await apiFetch<{ data?: PublicOrderResult } | PublicOrderResult>(
    "/api/craft-profit/public/orders",
    { method: "POST", body: JSON.stringify(input) },
  );
  const d = (json as { data?: PublicOrderResult })?.data;
  return d ?? (json as PublicOrderResult);
}

/** 演示支付（普通支付按钮）：unpaid → pending 待发货。 */
export async function payPublicOrder(orderId: string): Promise<PublicOrderResult> {
  const json = await apiFetch<{ data: PublicOrderResult }>(
    `/api/craft-profit/public/orders/${encodeURIComponent(orderId)}/pay`,
    { method: "POST" },
  );
  return json.data;
}

/** 顾客取消待支付订单（回补库存）；已支付订单请找商家走退款。 */
export async function cancelPublicOrder(orderId: string): Promise<PublicOrderResult> {
  const json = await apiFetch<{ data: PublicOrderResult }>(
    `/api/craft-profit/public/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST" },
  );
  return json.data;
}
