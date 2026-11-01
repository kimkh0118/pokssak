# 서버 이미지(Render). 데이터는 TURSO_DATABASE_URL 의 Turso에 저장되고,
# Turso 설정이 없을 때만 컨테이너 안 임시 파일을 쓴다(재시작하면 지워짐).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATABASE_PATH=/tmp/pokssak/app.db
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
# root 대신 일반 사용자로 실행
RUN useradd -m -u 1000 user
USER user
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860} --proxy-headers --forwarded-allow-ips='*'"]
