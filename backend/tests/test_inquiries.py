"""문의하기: 회원은 본인 문의만, 관리자는 전체를 보고 답장. 답장하면 알림함에 알림."""

from fastapi.testclient import TestClient

from app.main import app


def login(c, email):
    c.post("/api/auth/signup", json={"email": email, "password": "password1"})
    c.post("/api/auth/login", json={"email": email, "password": "password1"})


def test_문의_남기고_관리자가_답장하면_알림():
    with TestClient(app) as user, TestClient(app) as admin, TestClient(app) as other:
        login(user, "u@example.com")
        r = user.post("/api/inquiries", json={"category": "오류 신고", "body": "조회 버튼이 안 눌려요"})
        assert r.status_code == 200 and r.json()["reply"] is None
        iid = r.json()["id"]

        login(other, "o@example.com")
        assert other.get("/api/inquiries").json()["inquiries"] == []          # 남의 문의는 안 보임
        assert other.get("/api/admin/inquiries").status_code == 403          # 일반 회원은 관리자 화면 불가
        assert other.post(f"/api/admin/inquiries/{iid}/reply", json={"reply": "x"}).status_code == 403

        login(admin, "admin@example.com")                                     # conftest 의 관리자 이메일
        lst = admin.get("/api/admin/inquiries").json()
        assert lst["open"] == 1 and lst["inquiries"][0]["email"] == "u@example.com"
        assert admin.post(f"/api/admin/inquiries/{iid}/reply", json={"reply": "확인했어요. 고쳤습니다."}).json()["reply"]
        assert admin.get("/api/admin/inquiries", params={"status": "open"}).json()["open"] == 0

        mine = user.get("/api/inquiries").json()["inquiries"][0]
        assert mine["reply"] == "확인했어요. 고쳤습니다." and mine["repliedAt"]
        notes = user.get("/api/notifications").json()
        assert any("답장" in n["title"] for n in notes.get("notifications", notes.get("items", [])))


def test_문의_입력값_검사():
    with TestClient(app) as c:
        assert c.post("/api/inquiries", json={"category": "기타", "body": "내용입니다"}).status_code == 401
        login(c, "v@example.com")
        assert c.post("/api/inquiries", json={"category": "없는종류", "body": "내용입니다"}).status_code == 400
        assert c.post("/api/inquiries", json={"category": "기타", "body": "짧"}).status_code == 400
        assert c.post("/api/inquiries", json={"category": "기타", "body": "가" * 2001}).status_code == 400
