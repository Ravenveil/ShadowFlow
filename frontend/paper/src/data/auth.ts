/**
 * auth.ts — 账号与会话状态的对外出口。
 *
 * 实现住在 data/http/auth.ts（唯一允许 fetch 与 /api 字面量的一层，
 * `npm run check` 会拦住别处的直连）。组件从这里 import，别绕过去。
 */
export {
  authGuest,
  authLogin,
  authLogout,
  authRegister,
  authSubscribe,
  displayNameOf,
  getAuthSnapshot,
  initialsOf,
  refreshAuth,
  subscribeAuth,
  useAuthState,
} from './http/auth';
export type { AuthState, AuthUser } from './http/auth';
