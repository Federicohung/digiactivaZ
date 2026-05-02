"""
ACTIVA — Realtime broadcaster (SSE).

In-memory pub/sub por workspace_id. Cada conexión SSE crea una asyncio.Queue
y se le pushea cada evento publicado en su workspace. Heartbeat cada 15s
para mantener la conexión viva detrás de proxies.

Eventos emitidos por el resto del backend:
  - inbox.message.created
  - inbox.conversation.updated
  - inbox.conversation.read
  - inbox.connection.status_changed
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import AsyncIterator, Dict, List

logger = logging.getLogger(__name__)

# workspace_id -> list of subscriber queues
_subscribers: Dict[str, List[asyncio.Queue]] = defaultdict(list)


async def subscribe(workspace_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    _subscribers[workspace_id].append(q)
    logger.info(f"SSE subscribe ws={workspace_id} total={len(_subscribers[workspace_id])}")
    return q


def unsubscribe(workspace_id: str, q: asyncio.Queue) -> None:
    try:
        _subscribers.get(workspace_id, []).remove(q)
    except ValueError:
        pass


async def publish(workspace_id: str, event: str, data: dict) -> None:
    """Push an event to all SSE subscribers of a workspace."""
    if not workspace_id:
        return
    payload = json.dumps({"event": event, "data": data}, default=str)
    subs = list(_subscribers.get(workspace_id, []))
    for q in subs:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            # Drop oldest message to make room
            try:
                q.get_nowait()
                q.put_nowait(payload)
            except Exception:
                pass


async def event_stream(workspace_id: str) -> AsyncIterator[bytes]:
    """Async generator → bytes for FastAPI StreamingResponse."""
    q = await subscribe(workspace_id)
    try:
        # Initial comment so browsers know connection is open
        yield b": connected\n\n"
        while True:
            try:
                payload = await asyncio.wait_for(q.get(), timeout=15.0)
                yield f"data: {payload}\n\n".encode("utf-8")
            except asyncio.TimeoutError:
                # Heartbeat (SSE comment line) to defeat proxy timeouts
                yield b": ping\n\n"
    except asyncio.CancelledError:
        return
    finally:
        unsubscribe(workspace_id, q)
