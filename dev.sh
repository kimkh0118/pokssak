#!/usr/bin/env bash
# 백엔드(FastAPI :8000)와 프런트엔드(Next.js :3000)를 함께 실행한다. Ctrl+C 로 둘 다 종료.
set -e
cd "$(dirname "$0")"

if [ ! -x backend/.venv/bin/uvicorn ]; then
  echo "백엔드 패키지 설치 중…"
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi
if [ ! -d frontend/node_modules ]; then
  echo "프런트엔드 패키지 설치 중…"
  npm --prefix frontend ci
fi

backend/.venv/bin/uvicorn app.main:app --app-dir backend --port 8000 --reload --reload-dir backend/app &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null' EXIT

echo "백엔드: http://localhost:8000/docs  ·  화면: http://localhost:3000"
npm --prefix frontend run dev
