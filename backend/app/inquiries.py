"""문의하기: 회원이 문의를 남기면 관리자가 답장한다. 답장이 달리면 알림함·푸시로 알려준다."""

from __future__ import annotations

import uuid

from . import db as dbm, push
from .clock import now_iso

CATEGORIES = ["이용 문의", "오류 신고", "기능 제안", "기타"]
MAX_LEN = 2000


class InquiryError(Exception):
    pass


def _row(r) -> dict:
    return {"id": r["id"], "email": r["email"], "category": r["category"], "body": r["body"], "createdAt": r["created_at"],
            "reply": r["reply"], "repliedAt": r["replied_at"]}


def create(user: dict, category: str, body: str) -> dict:
    body = (body or "").strip()
    if category not in CATEGORIES:
        raise InquiryError("문의 종류를 골라 주세요.")
    if len(body) < 5:
        raise InquiryError("문의 내용을 5자 이상 적어 주세요.")
    if len(body) > MAX_LEN:
        raise InquiryError(f"문의 내용은 {MAX_LEN}자까지 쓸 수 있어요.")
    iid = str(uuid.uuid4())
    with dbm.connect() as c:
        c.execute("INSERT INTO inquiries (id, user_id, email, category, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                  (iid, user["id"], user["email"], category, body, now_iso()))
        r = c.execute("SELECT * FROM inquiries WHERE id = ?", (iid,)).fetchone()
    return _row(r)


def mine(user: dict) -> list[dict]:
    with dbm.connect() as c:
        return [_row(r) for r in c.execute("SELECT * FROM inquiries WHERE user_id = ? ORDER BY created_at DESC", (user["id"],))]


def all_for_admin(status: str = "all") -> list[dict]:
    where = {"open": "WHERE reply IS NULL", "answered": "WHERE reply IS NOT NULL"}.get(status, "")
    with dbm.connect() as c:
        # 답 안 한 문의가 먼저, 그 안에서는 오래된 것부터
        return [_row(r) for r in c.execute(f"SELECT * FROM inquiries {where} ORDER BY reply IS NOT NULL, created_at")]


def reply(admin: dict, inquiry_id: str, text: str) -> dict:
    text = (text or "").strip()
    if len(text) < 2:
        raise InquiryError("답장 내용을 적어 주세요.")
    if len(text) > MAX_LEN:
        raise InquiryError(f"답장은 {MAX_LEN}자까지 쓸 수 있어요.")
    now = now_iso()
    with dbm.connect() as c:
        r = c.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,)).fetchone()
        if not r:
            raise LookupError("문의를 찾을 수 없어요.")
        c.execute("UPDATE inquiries SET reply = ?, replied_at = ?, replied_by = ? WHERE id = ?", (text, now, admin["id"], inquiry_id))
        c.execute("INSERT INTO notifications (id, user_id, dedupe_key, asset_id, program_id, event, title, body, created_at) "
                  "VALUES (?, ?, ?, NULL, NULL, 'inquiry_reply', ?, ?, ?)",
                  (str(uuid.uuid4()), r["user_id"], f"inquiry:{inquiry_id}:{now}", "문의에 답장이 왔어요",
                   f"[{r['category']}] {text[:80]}", now))
        out = _row(c.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,)).fetchone())
    try:
        push.send(r["user_id"], "문의에 답장이 왔어요", text[:80], url="/inquiry")
    except Exception:  # noqa: BLE001 — 푸시 실패가 답장을 막지 않게
        pass
    return out
