/**
 * useUnifiedBubble — 「对话框统一」开关（chat-unify）。
 *
 * 用户明确要求把乱掉的聊天气泡统一成 StudioMessageRow 的回合分组形态。默认 ON
 * （体现用户意图），但保留可逆开关，以便对照 / 回滚旧 feed：
 *   - URL  ?unifiedBubble=0  → 关（强制走旧 ChatFeedFB / Timeline）
 *   - URL  ?unifiedBubble=1  → 开
 *   - localStorage 'sf.unifiedBubble' === '0' → 关（持久）
 *   - 默认（无任何设置）→ 开
 *
 * 走 react-router 的 useSearchParams（与 ChatPage / PersonalChatView 一致），
 * 这样 MemoryRouter 下的测试也能用 initialEntries 钉住开关。
 */
import { useSearchParams } from 'react-router-dom';

export function useUnifiedBubble(): boolean {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('unifiedBubble');
  if (q === '0') return false;
  if (q === '1') return true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('sf.unifiedBubble') === '0') {
      return false;
    }
  } catch {
    /* 隐私模式等读失败：退回默认开 */
  }
  return true;
}

export default useUnifiedBubble;
