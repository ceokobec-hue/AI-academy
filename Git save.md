# Git / Firebase 메모

```bash
git init
```

## 1️⃣ 현재 변경 상태 확인

```bash
git status
```

## 2️⃣ 모든 변경 파일 스테이징

```bash
git add .
```

## 3️⃣ 로컬에 저장 (버전 기록 남기기)

## 4️⃣ GitHub에 업로드 (원격 백업)

```bash
git push
```

## 🔥 큰 수정 전에 안전 스냅샷용

```bash
git add .
git commit -m "수정 전 백업"
```

## 🔎 커밋 기록 확인

```bash
git log --oneline
```

## 🆘 최근 커밋 상태로 되돌리기 (Undo All 복구용)

```bash
git reset --hard HEAD
```

## 원격 저장소 연결 예시

```bash
git remote add origin https://github.com/{username}/{repo}
```

---

## Firebase 개발용 규칙/세팅 메모 (강의 업로드/수강)

### 1) Firestore 구조(현재 프로젝트 기준)

- **강의(카탈로그/상세)**: `courses/{courseId}`
- **카테고리(콘솔에서 추가/수정)**: `categories/{categoryId}` (`name`, `order`)
- **유저/수강여부**: `users/{uid}` + `users/{uid}/enrollments/{courseId}`

### 2) Firestore Rules (개발용 예시)

아래 규칙은 개발 단계에서 편하게 테스트하기 위한 예시입니다. 운영 전에는 관리자 권한을 Custom Claims 등으로 강화하세요.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 카탈로그/상세에서 강의는 읽을 수 있게
    match /courses/{courseId} {
      allow read: if true;
      // TODO(운영): 관리자만 write
      allow write: if request.auth != null;
    }

    // 카테고리 읽기 허용(콘솔에서 관리)
    match /categories/{categoryId} {
      allow read: if true;
      // TODO(운영): 관리자만 write
      allow write: if request.auth != null;
    }

    // 유저 본인 문서 + 하위 문서(enrollments) 접근 허용
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 3) Storage Rules (개발용 예시)

관리자 페이지에서 업로드가 필요하므로, 개발 단계에서는 로그인 사용자가 업로드 가능하도록 열어두고 테스트할 수 있습니다.
(운영 전에는 관리자만 업로드 가능하도록 강화 권장)

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /courses/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### 4) 콘솔에서 준비할 것

- Authentication → Email/Password 활성화
- Firestore Database 생성
- Storage 활성화(파일 업로드용)
