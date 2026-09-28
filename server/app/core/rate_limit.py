"""按 key 滑动窗口限流（进程内内存；多 worker 各自独立）。"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException

from .security import get_current_openid


class SlidingWindowLimiter:
    """同一 key 在 window_seconds 内最多 max_calls 次。"""

    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > self.window_seconds:
            q.popleft()
        if len(q) >= self.max_calls:
            raise HTTPException(
                status_code=429,
                detail="请求太频繁，歇会儿再试",
            )
        q.append(now)


def user_rate_limit(max_calls: int, window_seconds: float):
    """依赖工厂：按登录用户 openid 限流。"""
    limiter = SlidingWindowLimiter(max_calls, window_seconds)

    def _dep(openid: str = Depends(get_current_openid)) -> str:
        limiter.check(openid)
        return openid

    return _dep
