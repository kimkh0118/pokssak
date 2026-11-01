#!/bin/zsh
# 더블클릭 한 번: 바뀐 내용을 저장(커밋)하고 GitHub에 올린다(→ Vercel 화면 자동 배포),
# 그리고 backend 폴더를 Hugging Face Space에 올린다(→ 서버 자동 배포).
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
pause() { read -k1 "?아무 키나 누르면 닫혀요"; }

# 1) 저장 (.env 같은 비밀값은 .gitignore 로 빠진다)
git add -A
if git diff --cached --quiet; then
  echo "새로 저장할 변경은 없어요."
else
  git commit -q -m "업데이트 ($(date '+%m/%d %H:%M'))" && echo "저장했어요: $(git log --oneline -1)"
fi

# 2) GitHub (Vercel이 보고 화면을 다시 배포)
branch=$(git branch --show-current)
if git pull -q --rebase origin "$branch" && git push -q origin "$branch"; then
  echo "GitHub에 올렸어요. Vercel이 화면을 다시 배포해요."
else
  echo "GitHub에 올리지 못했어요."; pause; exit 1
fi

# 3) Hugging Face Space (서버)
if ! git remote get-url hf >/dev/null 2>&1; then
  echo ""
  echo "처음 한 번만: Hugging Face에서 만든 Space 주소를 알려주세요."
  read "hfuser?Hugging Face 사용자 이름: "
  read "hfspace?Space 이름(예: pokssak-api): "
  git remote add hf "https://huggingface.co/spaces/${hfuser}/${hfspace}"
  git config credential.helper osxkeychain
  echo "곧 로그인 창이 뜨면 Username 에 사용자 이름, Password 에 Hugging Face 토큰(Write 권한)을 넣어 주세요."
  echo "한 번 넣으면 맥 키체인에 저장돼서 다음부터는 안 물어봐요."
fi
echo "서버를 Hugging Face에 올리는 중…"
git branch -D hf-deploy >/dev/null 2>&1
git subtree split -q --prefix backend -b hf-deploy || { echo "서버 묶기에 실패했어요."; pause; exit 1; }
if git push -q -f hf hf-deploy:main; then
  echo "서버를 올렸어요. Hugging Face가 다시 빌드해요(2~5분)."
else
  echo "Hugging Face에 올리지 못했어요. 토큰이 Write 권한인지 확인해 주세요."; git branch -D hf-deploy >/dev/null 2>&1; pause; exit 1
fi
git branch -D hf-deploy >/dev/null 2>&1

echo ""
echo "완료! 몇 분 뒤 사이트를 새로고침하면 새 버전이에요."
pause
