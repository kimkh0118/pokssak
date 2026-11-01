"""테스트용 가짜 Turso 서버: /v2/pipeline 요청을 실제 SQLite 파일에 실행해 Turso와 같은 JSON으로 답한다."""

import base64
import sqlite3

import httpx


def _arg(a):
    t = a["type"]
    if t == "integer":
        return int(a["value"])
    if t == "float":
        return float(a["value"])
    if t == "text":
        return a["value"]
    if t == "blob":
        return base64.b64decode(a["base64"])
    return None


def _val(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, bytes):
        return {"type": "blob", "base64": base64.b64encode(v).decode()}
    return {"type": "text", "value": v}


def transport(path: str) -> httpx.MockTransport:
    def handle(req: httpx.Request):
        assert req.url.path == "/v2/pipeline" and req.headers.get("authorization") == "Bearer tok"
        db = sqlite3.connect(path, isolation_level=None)
        db.execute("PRAGMA foreign_keys = ON")
        results = []
        for r in httpx.Response(200, content=req.content).json()["requests"]:
            if r["type"] == "close":
                results.append({"type": "ok", "response": {"type": "close"}})
                continue
            try:
                cur = db.execute(r["stmt"]["sql"], [_arg(a) for a in r["stmt"].get("args", [])])
                rows = cur.fetchall()
                cols = [{"name": d[0]} for d in cur.description or []]
                results.append({"type": "ok", "response": {"type": "execute", "result": {
                    "cols": cols, "rows": [[_val(v) for v in row] for row in rows],
                    "affected_row_count": max(cur.rowcount, 0),
                    "last_insert_rowid": str(cur.lastrowid) if cur.lastrowid is not None else None}}})
            except sqlite3.Error as e:
                results.append({"type": "error", "error": {"message": str(e)}})
        db.close()
        return httpx.Response(200, json={"baton": None, "base_url": None, "results": results})

    return httpx.MockTransport(handle)
