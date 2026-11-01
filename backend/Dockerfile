# 폭싹 백엔드(FastAPI) — Railway 등에서 실행. DB(SQLite)는 볼륨(/data)에 둔다.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATABASE_PATH=/data/app.db
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
# Railway 는 PORT 환경변수를 준다. 워커 1개(매일 가격 확인 스케줄러가 한 번만 돌도록)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
