/**
 * message-feedback.ts — 单后端迁移：/api/messages/:mid/feedback (GET+POST)
 * 响应 shape 与 Python groups.py 的 _envelope(_feedback_view(...)) 对齐：
 *   { data: { message_id, up, down, my_rating }, meta: {} }
 */

import { Router, Request, Response } from 'express';
import {
  getFeedback,
  postFeedback,
  isValidMessageId,
} from '../../storage/message-feedback';

const router = Router();

function envelope(data: unknown): { data: unknown; meta: Record<string, never> } {
  return { data, meta: {} };
}

function badId(res: Response): void {
  res.status(400).json({ error: { code: 'INVALID_MESSAGE_ID', message: 'Invalid message_id' } });
}

router.get('/:messageId/feedback', (req: Request, res: Response) => {
  const { messageId } = req.params;
  if (!isValidMessageId(messageId)) return badId(res);
  const userId =
    typeof req.query.user_id === 'string' ? req.query.user_id : 'anonymous';
  res.json(envelope(getFeedback(messageId, userId)));
});

router.post('/:messageId/feedback', (req: Request, res: Response) => {
  const { messageId } = req.params;
  if (!isValidMessageId(messageId)) return badId(res);
  const body = (req.body ?? {}) as { rating?: unknown; user_id?: unknown };
  const rating = body.rating;
  if (rating !== 1 && rating !== -1) {
    res.status(422).json({
      error: { code: 'INVALID_RATING', message: 'rating must be 1 or -1' },
    });
    return;
  }
  const userId =
    typeof body.user_id === 'string' && body.user_id ? body.user_id : 'anonymous';
  res.json(envelope(postFeedback(messageId, rating, userId)));
});

export default router;
