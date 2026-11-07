/**
 * social-platforms/real-shipinhao.ts — 微信视频号真实连线边界（2026-11-07）。
 *
 * 实况（developers.weixin.qq.com 社区/文档核实）：视频号内容发布**不对普通
 * 开发者开放第三方直发 API**，仅两条路：
 *   1. 服务商模式：微信「第三方平台」申请视频号相关权限集，获得商家授权后以
 *      authorizer_access_token 代发布（权限集说明见 channel_authority 文档）；
 *   2. 视频号助手人工发布。
 * 模拟登录类「自动发布」违反平台规则（下架/限流/封号），坚决不接。
 *
 * 因此本适配器：凭证校验后返回结构化 REAL_WIRING_PENDING 回执——等权限集开通、
 * 官方代发布端点可用后在本文件接线，接口不变。凭证：SP_SHIPINHAO_ACCESS_TOKEN
 * （服务商 authorizer_access_token）。
 */

import type { PlatformAdapter, PlatformSpec, PublishReceipt } from './types';

export function createShipinhaoAdapter(_spec: PlatformSpec): PlatformAdapter {
  return {
    platform: _spec.id,
    mode: 'real',
    async publish(): Promise<PublishReceipt> {
      const token = (process.env.SP_SHIPINHAO_ACCESS_TOKEN ?? '').trim();
      if (!token) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error:
            '缺少环境变量 SP_SHIPINHAO_ACCESS_TOKEN（微信第三方平台 authorizer_access_token，' +
            '需服务商资质 + 视频号权限集授权）',
        };
      }
      return {
        ok: false,
        code: 'REAL_WIRING_PENDING',
        error:
          '视频号内容发布仅对第三方平台服务商权限集开放代发布，当前权限集未开通/端点未开放。' +
          '待微信开放平台权限集通过后在 real-shipinhao.ts 接线（不接模拟登录类非官方通道）',
      };
    },
  };
}
