git init


# 1️⃣ 현재 변경 상태 확인
git status

# 2️⃣ 모든 변경 파일 스테이징
git add .

# 3️⃣ 로컬에 저장 (버전 기록 남기기)
git commit -m "작업 내용 간단히 설명"

# 4️⃣ GitHub에 업로드 (원격 백업)
git push


# 🔥 큰 수정 전에 안전 스냅샷용
git add .
git commit -m "수정 전 백업"

# 🔎 커밋 기록 확인
git log --oneline

# 🆘 최근 커밋 상태로 되돌리기 (Undo All 복구용)
git reset --hard HEAD


git remote add origin https://github.com/<ceokobec-hue>/<git id>