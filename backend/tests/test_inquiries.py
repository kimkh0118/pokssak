"""문의하기: 회원은 본인 문의만, 관리자는 전체를 보고 답장. 답장하면 알림함에 알림."""

from fastapi.testclient import TestClient

from app.main import app


def login(c, email):
    c.post("/api/auth/signup", json={"email": email, "password": "password1"})
    c.post("/api/auth/login", json={"email": email, "password": "password1"})


def test_문의_남기고_관리자가_답장하면_알림():
    with TestClient(app) as user, TestClient(app) as admin, TestClient(app) as other:
        login(user, "u@example.com")
        r = user.post("/api/inquiries", json={"category": "오류 신고", "title": "조회 버튼", "body": "조회 버튼이 안 눌려요"})
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
        note = next(n for n in notes["items"] if n["event"] == "inquiry_reply")
        assert "‘조회 버튼’" in note["title"] and note["link"] == f"/inquiry/{iid}"   # 어떤 문의인지 + 그 문의로 이동
        assert user.get(f"/api/inquiries/{iid}").json()["reply"]
        assert other.get(f"/api/inquiries/{iid}").status_code == 404                  # 남의 문의 상세는 못 봄
        assert admin.get(f"/api/inquiries/{iid}").status_code == 200


def test_문의_입력값_검사():
    with TestClient(app) as c:
        ok = {"category": "이용 문의", "title": "제목입니다", "body": "내용입니다"}
        assert c.post("/api/inquiries", json=ok).status_code == 401
        login(c, "v@example.com")
        assert c.post("/api/inquiries", json=ok | {"category": "없는종류"}).status_code == 400
        assert c.post("/api/inquiries", json=ok | {"title": "제"}).status_code == 400
        assert c.post("/api/inquiries", json=ok | {"body": "짧"}).status_code == 400
        assert c.post("/api/inquiries", json=ok | {"body": "가" * 2001}).status_code == 400
        assert c.post("/api/inquiries", json=ok | {"category": "기타"}).status_code == 400          # 기타는 종류를 직접 적어야
        r = c.post("/api/inquiries", json=ok | {"category": "기타", "custom": "제휴 제안"})
        assert r.status_code == 200 and r.json()["category"] == "제휴 제안"
