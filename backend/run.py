"""백엔드 + 사이트 화면 실행 파일. VS Code에서 이 파일을 열고 ▶(Run Python File)를 누르거나:

    backend/.venv/bin/python backend/run.py

app/main.py 는 패키지 안의 모듈이라 직접 실행하면 import 오류가 난다. 항상 이 파일로 실행한다.
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
VENV_PYTHON = BACKEND_DIR / ".venv" / "bin" / "python"

# 다른 파이썬(예: Homebrew)으로 실행됐다면 프로젝트 가상환경(.venv) 파이썬으로 '딱 한 번' 다시 실행한다.
# RUN_PY_RELAUNCHED 표시로 다시 실행이 반복되지 않게 막는다.
in_venv = Path(sys.prefix).resolve() == (BACKEND_DIR / ".venv").resolve()
if not in_venv and VENV_PYTHON.exists() and os.environ.get("RUN_PY_RELAUNCHED") != "1":
    print("프로젝트 가상환경(.venv)으로 다시 실행합니다…", flush=True)
    os.environ["RUN_PY_RELAUNCHED"] = "1"
    os.environ["PYTHONUNBUFFERED"] = "1"
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]])

try:
    import fastapi  # noqa: F401
    import uvicorn
except ModuleNotFoundError:
    raise SystemExit("서버 패키지가 없습니다. 먼저 실행:  python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt")


import shutil
import subprocess

FRONTEND_DIR = BACKEND_DIR.parent / "frontend"


def start_frontend() -> subprocess.Popen | None:
    """사이트 화면(Next.js, :3000)을 함께 켠다. npm 이 없으면 안내만 한다."""
    npm = shutil.which("npm")
    if not npm:
        print("※ npm(Node.js)이 없어 사이트 화면은 켜지 않았습니다. Node.js 설치 후 다시 실행하세요.", flush=True)
        return None
    if not (FRONTEND_DIR / "node_modules").exists():
        print("사이트 화면 패키지 설치 중…(처음 한 번)", flush=True)
        subprocess.run([npm, "ci"], cwd=FRONTEND_DIR, check=True)
    return subprocess.Popen([npm, "run", "dev"], cwd=FRONTEND_DIR)


if __name__ == "__main__":
    sys.path.insert(0, str(BACKEND_DIR))
    frontend = start_frontend()
    print("\n사이트:   http://localhost:3000   ← 브라우저에서 여세요", flush=True)
    print("API 문서: http://localhost:8000/docs", flush=True)
    print("끄려면 이 창에서 Ctrl+C\n", flush=True)
    try:
        uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True,
                    app_dir=str(BACKEND_DIR), reload_dirs=[str(BACKEND_DIR / "app")])
    finally:
        if frontend:
            frontend.terminate()
