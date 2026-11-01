"""Turso(원격 SQLite) 연결. 무료 서버는 껐다 켜면 파일이 지워지므로 배포에서는 데이터를 Turso에 둔다.

Turso의 HTTP API(/v2/pipeline)를 httpx로 부르고, 나머지 코드가 그대로 쓰도록 sqlite3 연결과 같은 모양
(execute·executescript·fetchone·fetchall·lastrowid·row["이름"]·with 문)을 흉내 낸다.
문장 하나가 요청 하나이고 바로 저장된다(여러 문장을 묶는 트랜잭션은 없음).
"""

from __future__ import annotations

import base64
import sqlite3

import httpx


class Row:
    """sqlite3.Row 처럼 row[0] 과 row["이름"] 둘 다 되는 행"""

    __slots__ = ("_cols", "_vals")

    def __init__(self, cols: list[str], vals: list):
        self._cols, self._vals = cols, vals

    def __getitem__(self, k):
        if isinstance(k, str):
            return self._vals[self._cols.index(k)]
        return self._vals[k]

    def keys(self):
        return list(self._cols)

    def __iter__(self):
        return iter(self._vals)

    def __len__(self):
        return len(self._vals)

    def __repr__(self):
        return f"Row({dict(zip(self._cols, self._vals))})"


class Cursor:
    def __init__(self, rows: list[Row], lastrowid: int | None, rowcount: int):
        self._rows, self.lastrowid, self.rowcount = rows, lastrowid, rowcount

    def fetchone(self):
        return self._rows.pop(0) if self._rows else None

    def fetchall(self):
        rows, self._rows = self._rows, []
        return rows

    def __iter__(self):
        return iter(self.fetchall())


def _arg(v) -> dict:
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, (bytes, bytearray, memoryview)):
        return {"type": "blob", "base64": base64.b64encode(bytes(v)).decode()}
    return {"type": "text", "value": str(v)}


def _val(v: dict):
    t = v.get("type")
    if t == "integer":
        return int(v["value"])
    if t == "float":
        return float(v["value"])
    if t == "text":
        return v["value"]
    if t == "blob":
        return base64.b64decode(v.get("base64") or "")
    return None


def _error(msg: str) -> Exception:
    if "constraint" in msg.lower():
        return sqlite3.IntegrityError(msg)
    return sqlite3.OperationalError(msg)


def split_script(sql: str) -> list[str]:
    """여러 문장 SQL을 문장 단위로 나눈다(트리거의 BEGIN…END 안 세미콜론은 그대로 둔다)."""
    out, buf = [], ""
    for line in sql.splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            if buf.strip().strip(";").strip():
                out.append(buf.strip())
            buf = ""
    if buf.strip():
        out.append(buf.strip())
    return out


class Connection:
    def __init__(self, url: str, token: str | None, client: httpx.Client):
        base = url.replace("libsql://", "https://", 1).rstrip("/")
        self._endpoint = f"{base}/v2/pipeline"
        self._headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._client = client

    def _run(self, stmts: list[tuple[str, tuple]]) -> list[Cursor]:
        reqs = [{"type": "execute", "stmt": {"sql": s, "args": [_arg(a) for a in p]}} for s, p in stmts]
        r = self._client.post(self._endpoint, headers=self._headers, json={"requests": reqs + [{"type": "close"}]})
        if r.status_code >= 400:
            raise sqlite3.OperationalError(f"Turso HTTP {r.status_code}: {r.text[:200]}")
        out = []
        for res in r.json()["results"][: len(stmts)]:
            if res.get("type") != "ok":
                raise _error((res.get("error") or {}).get("message", "Turso 오류"))
            body = res["response"]["result"]
            cols = [c.get("name") or "" for c in body.get("cols", [])]
            rows = [Row(cols, [_val(v) for v in row]) for row in body.get("rows", [])]
            last = body.get("last_insert_rowid")
            out.append(Cursor(rows, int(last) if last is not None else None, body.get("affected_row_count", 0)))
        return out

    def execute(self, sql: str, params=()) -> Cursor:
        return self._run([(sql, tuple(params or ()))])[0]

    def executescript(self, sql: str):
        stmts = [(s, ()) for s in split_script(sql)]
        if stmts:
            self._run(stmts)

    # 문장마다 바로 저장되므로 아래는 sqlite3 와 모양만 맞춘다
    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False
