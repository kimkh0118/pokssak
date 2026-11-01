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
    title = r["title"] or (r["body"][:30] + ("…" if len(r["body"]) > 30 else ""))  # 제목 없던 예전 문의는 내용 앞부분
    return {"id": r["id"], "email": r["email"], "category": r["category"], "title": title, "body": r["body"],
            "createdAt": r["created_at"], "reply": r["reply"], "repliedAt": r["replied_at"]}


def create(user: dict, category: str, title: str, body: str, custom: str = "") -> dict:
    """category 가 '기타'면 custom(직접 입력한 종류, 2~20자)을 종류로 저장한다."""
    title, body, custom = (title or "").strip(), (body or "").strip(), (custom or "").strip()
    if category not in CATEGORIES:
        raise InquiryError("문의 종류를 골라 주세요.")
    if category == "기타":
        if not 2 <= len(custom) <= 20:
            raise InquiryError("'기타'를 골랐다면 문의 종류를 2~20자로 적어 주세요.")
        category = custom
    if not 2 <= len(title) <= 60:
        raise InquiryError("제목을 2~60자로 적어 주세요.")
    if len(body) < 5:
        raise InquiryError("문의 내용을 5자 이상 적어 주세요.")
    if len(body) > MAX_LEN:
        raise InquiryError(f"문의 내용은 {MAX_LEN}자까지 쓸 수 있어요.")
    iid = str(uuid.uuid4())
    with dbm.connect() as c:
        c.execute("INSERT INTO inquiries (id, user_id, email, category, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                  (iid, user["id"], user["email"], category, title, body, now_iso()))
        r = c.execute("SELECT * FROM inquiries WHERE id = ?", (iid,)).fetchone()
    return _row(r)


def get(user: dict, inquiry_id: str) -> dict:
    """본인 문의 또는 관리자만"""
    with dbm.connect() as c:
        r = c.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,)).fetchone()
    if not r or (r["user_id"] != user["id"] and not user.get("isAdmin")):
        raise LookupError("문의를 찾을 수 없어요.")
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
        out = _row(c.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,)).fetchone())
        # 어떤 문의에 대한 답장인지 제목을 넣고, 누르면 그 문의로 바로 가게
        note_title = f"‘{out['title']}’ 문의에 답장이 왔어요"
        c.execute("INSERT INTO notifications (id, user_id, dedupe_key, asset_id, program_id, event, title, body, created_at, link) "
                  "VALUES (?, ?, ?, NULL, NULL, 'inquiry_reply', ?, ?, ?, ?)",
                  (str(uuid.uuid4()), r["user_id"], f"inquiry:{inquiry_id}:{now}", note_title, text[:100], now, f"/inquiry/{inquiry_id}"))
    try:
        push.send(r["user_id"], note_title, text[:80], url=f"/inquiry/{inquiry_id}")
    except Exception:  # noqa: BLE001 — 푸시 실패가 답장을 막지 않게
        pass
    return out
