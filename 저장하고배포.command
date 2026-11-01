#!/bin/zsh
# 더블클릭 한 번: 바뀐 내용을 저장(커밋)하고 GitHub에 올린다.
# GitHub에 올라가면 Vercel(화면)과 Render(서버)가 알아서 다시 배포한다.
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
  echo "GitHub에 올렸어요. Vercel(화면)과 Render(서버)가 다시 배포해요(서버는 3~5분)."
else
  echo "GitHub에 올리지 못했어요."; pause; exit 1
fi

echo ""
echo "완료! 몇 분 뒤 사이트를 새로고침하면 새 버전이에요."
pause
