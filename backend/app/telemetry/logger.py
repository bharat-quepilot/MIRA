import json
import sys
from typing import Any


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


class _Logger:
    def agent(self, name: str, *, ms: float, ok: bool, **extra: Any) -> None:
        _emit({"type": "agent", "name": name, "ms": round(ms, 1), "ok": ok, **extra})

    def fallback(self, agent: str, *, reason: str) -> None:
        _emit({"type": "fallback", "agent": agent, "reason": reason})

    def request(self, path: str, *, ms: float, status: int, **extra: Any) -> None:
        _emit({"type": "request", "path": path, "ms": round(ms, 1), "status": status, **extra})

    def info(self, message: str, **extra: Any) -> None:
        _emit({"type": "info", "message": message, **extra})

    def error(self, message: str, **extra: Any) -> None:
        _emit({"type": "error", "message": message, **extra})


logger = _Logger()
