"""Group chat SSE event bus — per-group in-process pub/sub.

Mirrors the approval event bus (`shadowflow.runtime.approval.service`) but
buckets subscribers by ``group_id`` so a chat room only receives its own
events. Used to push asynchronously-produced agent replies (from the
``_chat_bridge`` background task) to the browser in real time, instead of
relying on the client to poll ``GET /api/groups/{id}/messages``.

Design notes
------------
- **In-process only**: a module-level ``Dict[group_id, List[asyncio.Queue]]``.
  Under a multi-worker deployment, events published in one process won't reach
  SSE subscribers in another — the same limitation the approval / workflow SSE
  buses already have. Acceptable for the single-uvicorn-process MVP.
- **Best-effort delivery**: full queues are skipped (``QueueFull`` swallowed)
  rather than blocking the publisher (a background task that must not stall).
- **Self-cleaning**: when a group's last subscriber unsubscribes, its bucket is
  removed so the dict doesn't grow unbounded.

Event shape: ``{"type": "agent.message" | "system.notice" | "agent.typing",
"data": {...}}``. The SSE endpoint serialises ``data`` as the SSE ``data:``
line and ``type`` as the ``event:`` line.

History
-------
2026-05-29 — Created for the real-chat (DM + group) work: closes the gap where
agent replies landed in the group JSON file but the UI never saw them without a
manual refresh.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

# group_id -> list of subscriber queues
_subscribers: Dict[str, List[asyncio.Queue]] = {}

# Bounded so a slow/dead client can't grow memory without limit.
_QUEUE_MAXSIZE = 100


def subscribe(group_id: str) -> asyncio.Queue:
    """Register a new subscriber queue for ``group_id`` and return it."""
    q: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _subscribers.setdefault(group_id, []).append(q)
    return q


def unsubscribe(group_id: str, q: asyncio.Queue) -> None:
    """Remove a subscriber queue; drop the bucket when it becomes empty."""
    queues = _subscribers.get(group_id)
    if not queues:
        return
    try:
        queues.remove(q)
    except ValueError:
        pass
    if not queues:
        _subscribers.pop(group_id, None)


def publish_group_event(group_id: str, event: Dict[str, Any]) -> None:
    """Push an event to all subscribers of ``group_id``.

    Best-effort: full queues are skipped so a stuck client never blocks the
    background dispatch task. No-op when nobody is listening.
    """
    for q in list(_subscribers.get(group_id, [])):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


def subscriber_count(group_id: str) -> int:
    """Number of live subscribers for a group (used by tests)."""
    return len(_subscribers.get(group_id, []))
