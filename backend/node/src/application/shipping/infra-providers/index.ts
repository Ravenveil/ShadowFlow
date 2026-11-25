/**
 * shipping/index.ts — 快递承运商适配器（2026-11-07）。
 *
 * 产业方向（手工艺人代运营）：对方只上架商品，我们负责营销发布 + **联系快递
 * 寄出**。社交发布域（lib/social-platforms）已覆盖「营销发布」出口，本模块补上
 * 「寄出」出口，两者形态刻意对齐：统一 CarrierAdapter 接口 + 六家主流承运商
 * 注册表（顺丰 / 中通 / 圆通 / 京东 / 邮政 EMS / 德邦）。
 *
 * mock / real 双模（按运单选）：
 *   - mock（默认）：确定性面单号（prefix + sha256(shipment#attempt) 派生的 12 位
 *     数字），不发外网、可测试可演示 —— 无凭证环境的「寄出」走这条。
 *   - real：按承运商读 env 凭证（见 realEnvContract）。缺凭证返回结构化
 *     CREDENTIALS_MISSING 回执（不是异常、不 5xx）；接口位齐备但**尚未接任何
 *     真实承运商开放平台**（下单/电子面单需要签约账号 + 网点授权，拿到后按同一
 *     接口补 ship/track 两个方法，调用方不改）。
 *
 * 纯函数模块：不 import storage、无 DB 依赖，方便单测与后续替换真实现。
 */

import { createHash } from 'node:crypto';

export type ShipMode = 'mock' | 'real';

/** 运单在承运商侧的三个关键状态（建单/待交运由存储层自己的 pending 表示）。 */
export type CarrierStatus = 'shipped' | 'in_transit' | 'delivered';

export interface CarrierSpec {
  id: string;
  name: string;
  /**
   * 面单号前缀。真实承运商单号并不都带前缀，这里只是为了 mock 单号可读、
   * 且一眼能看出是模拟单据；real 模式一律用承运商返回的原值。
   */
  tracking_prefix: string;
}

export const CARRIERS: CarrierSpec[] = [
  { id: 'sf', name: '顺丰速运', tracking_prefix: 'SF' },
  { id: 'zto', name: '中通快递', tracking_prefix: 'ZTO' },
  { id: 'yto', name: '圆通速递', tracking_prefix: 'YT' },
  { id: 'jd', name: '京东物流', tracking_prefix: 'JD' },
  { id: 'ems', name: '中国邮政EMS', tracking_prefix: 'EMS' },
  { id: 'debang', name: '德邦快递', tracking_prefix: 'DB' },
];

export function findCarrier(id: string): CarrierSpec | undefined {
  return CARRIERS.find((c) => c.id === id);
}

/** real 模式各承运商的凭证契约（env 变量名 + 说明），也用于 /carriers 端点自描述。 */
const REAL_ENV: Record<string, { env: string; note: string }> = {
  sf: { env: 'SHIP_SF_API_TOKEN', note: '顺丰丰桥开放平台 accessToken（下单 + 路由查询）' },
  zto: { env: 'SHIP_ZTO_API_KEY', note: '中通开放平台 appKey/secret 换取的签名密钥' },
  yto: { env: 'SHIP_YTO_API_KEY', note: '圆通开放平台接口密钥（需网点授权）' },
  jd: { env: 'SHIP_JD_API_TOKEN', note: '京东物流开放平台 token（需商家签约）' },
  ems: { env: 'SHIP_EMS_API_TOKEN', note: '中国邮政 EMS 开放平台 token' },
  debang: { env: 'SHIP_DEBANG_API_KEY', note: '德邦开放平台接口密钥' },
};

export function realEnvContract(carrier: string): { env: string; note: string } | undefined {
  return REAL_ENV[carrier];
}

/** 收件信息：建运单的必填主体，缺一项就不该出单（错寄成本远高于少发一条营销帖）。 */
export interface ReceiverInfo {
  name: string;
  phone: string;
  address: string;
}

export interface ShipInput extends ReceiverInfo {
  /** 本地运单 ID（存储层生成），用于派生确定性 mock 单号。 */
  shipment_id: string;
  /** 关联订单 ID（mb_orders），可为空 —— 线下手工单也允许寄。 */
  order_id: string;
  weight_grams: number;
  remark: string;
}

/** 交运回执：成功失败都是结构化对象，统一落 ops_shipments.error / 事件表。 */
export interface ShipReceipt {
  ok: boolean;
  /** 承运商面单号（mock 模式为确定性派生值）。 */
  tracking_no?: string;
  /** 失败时的结构化码：CREDENTIALS_MISSING / REAL_WIRING_PENDING / NETWORK_ERROR。 */
  code?: string;
  error?: string;
  raw?: unknown;
}

export interface TrackEvent {
  status: CarrierStatus;
  note: string;
  /** epoch ms —— 由适配器给，mock 用当前时间，real 用承运商回传时间。 */
  at: number;
}

export interface TrackReceipt {
  ok: boolean;
  status?: CarrierStatus;
  events?: TrackEvent[];
  code?: string;
  error?: string;
  raw?: unknown;
}

export interface CarrierAdapter {
  carrier: string;
  mode: ShipMode;
  ship(input: ShipInput, attempt: number): Promise<ShipReceipt>;
  track(trackingNo: string): Promise<TrackReceipt>;
}

/**
 * 确定性 mock 面单号：同一运单同一次尝试永远同值（测试可断言、演示可复现）。
 * 取 sha256 前 12 个十六进制字符映射成数字，凑够 12 位。
 */
function mockTrackingNo(spec: CarrierSpec, shipmentId: string, attempt: number): string {
  const hex = createHash('sha256')
    .update(`${shipmentId}#${attempt}`)
    .digest('hex')
    .slice(0, 12);
  const digits = hex
    .split('')
    .map((ch) => String(parseInt(ch, 16) % 10))
    .join('');
  return `${spec.tracking_prefix}${digits}`;
}

function mockAdapter(spec: CarrierSpec): CarrierAdapter {
  return {
    carrier: spec.id,
    mode: 'mock',
    async ship(input, attempt) {
      return {
        ok: true,
        tracking_no: mockTrackingNo(spec, input.shipment_id, attempt),
        raw: {
          mode: 'mock',
          carrier: spec.id,
          order_id: input.order_id,
          receiver_city_guess: input.address.slice(0, 12),
          weight_grams: input.weight_grams,
          attempt,
        },
      };
    },
    async track(trackingNo) {
      // mock 轨迹：揽收 + 到达转运中心。刻意**不伪造「已签收」**——签收要真实
      // 终端回传，mock 里编一个会让「已送达」这个状态失去意义。
      const at = Date.now();
      return {
        ok: true,
        status: 'in_transit',
        events: [
          { status: 'shipped', note: `${spec.name}已揽收（模拟）`, at },
          { status: 'in_transit', note: '快件已到达转运中心（模拟）', at },
        ],
        raw: { mode: 'mock', carrier: spec.id, tracking_no: trackingNo },
      };
    },
  };
}

function realAdapter(spec: CarrierSpec): CarrierAdapter {
  const contract = REAL_ENV[spec.id];
  return {
    carrier: spec.id,
    mode: 'real',
    async ship(_input) {
      const token = (process.env[contract?.env ?? ''] ?? '').trim();
      if (!token) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error: `缺少环境变量 ${contract?.env ?? '(未定义)'}（${contract?.note ?? ''}），无法真实下单`,
        };
      }
      // 各家 open API 的下单/电子面单都需要签名 + 网点授权，且报文结构互不相同。
      // 凭证与签约到位后在此按承运商分支实现，接口（ship/track）不变。
      return {
        ok: false,
        code: 'REAL_WIRING_PENDING',
        error: `${spec.name} 真实下单链路待接线（签约 + 电子面单），适配器接口已就位`,
      };
    },
    async track(_trackingNo) {
      const token = (process.env[contract?.env ?? ''] ?? '').trim();
      if (!token) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error: `缺少环境变量 ${contract?.env ?? '(未定义)'}，无法查询真实轨迹`,
        };
      }
      return {
        ok: false,
        code: 'REAL_WIRING_PENDING',
        error: `${spec.name} 真实轨迹查询待接线，适配器接口已就位`,
      };
    },
  };
}

export function getCarrierAdapter(carrier: string, mode: ShipMode): CarrierAdapter {
  const spec = findCarrier(carrier);
  if (!spec) {
    throw new Error(`未知承运商: ${carrier}`);
  }
  return mode === 'real' ? realAdapter(spec) : mockAdapter(spec);
}
