export const COURSES = [
  {
    id: "ai-mba-001",
    categoryId: "ai-office",
    isNew: true,
    isPopular: true,
    title: "AI경영 입문: 사장님도 할 수 있는 업무 자동화",
    shortDescription:
      "AI를 ‘업무 도구’로 쓰는 가장 쉬운 출발. 문서/보고서/회의/리서치 자동화를 실습으로 익힙니다.",
    priceKrw: 99000,
    durationDays: 30,
    startDate: "2026-03-01",
    thumbnailUrl: "./assets/hero.png",
    content: {
      overview:
        "이 강의는 AI를 처음 접하는 분도 따라올 수 있도록, ‘업무에 바로 적용’ 중심으로 구성했습니다. 실습 위주로 작은 성공 경험을 만들고, 이후 확장 방법까지 안내합니다.",
      bullets: [
        "업무에 바로 쓰는 프롬프트 구조(목표/맥락/제약/출력형식)",
        "회의록/보고서/메일 자동화 템플릿",
        "리서치 정리 및 요약 품질 올리는 방법",
        "내 업무에 맞춘 체크리스트/자동화 루틴 만들기",
      ],
    },
    video: {
      // 샘플: 실제 영상 업로드 전까지는 null로 두고 '잠금/안내' UI로 표시
      src: "",
      poster: "",
    },
    resources: [
      {
        title: "프롬프트 기본 템플릿",
        description: "업무용 프롬프트를 빠르게 만들 수 있는 템플릿입니다.",
        code: `# 업무 프롬프트 템플릿
역할: 당신은 [직무/역할] 전문가입니다.
목표: [원하는 결과]
맥락: [배경 정보]
제약: [톤/길이/형식/금지사항]
출력형식: [표/목록/JSON 등]

예시 입력:
- 대상: ...
- 기간: ...
- 핵심 포인트: ...
`,
      },
    ],
    files: [
      {
        name: "강의 자료(예시).pdf",
        description: "예시 파일입니다. 실제 자료 업로드 후 링크를 교체하세요.",
        url: "#",
      },
    ],
  },
  {
    id: "ai-mba-002",
    categoryId: "ai-business",
    isNew: true,
    isPopular: false,
    title: "실무 리서치/데이터분석: 의사결정에 쓰는 AI",
    shortDescription:
      "리서치-정리-인사이트 도출을 빠르게. 실무 보고서 품질을 올리는 데이터 사고방식을 함께 다룹니다.",
    priceKrw: 149000,
    durationDays: 45,
    startDate: "2026-03-10",
    thumbnailUrl: "",
    content: {
      overview:
        "데이터/리서치 결과를 ‘의사결정 문서’로 바꾸는 흐름을 학습합니다. 단순 요약을 넘어, 비교/가설/결론까지 자연스럽게 이어지도록 설계합니다.",
      bullets: [
        "좋은 질문 만들기: 가설 → 검증 → 결론",
        "시장/경쟁 리서치 프레임",
        "표/요약/결론이 한 번에 나오는 출력 설계",
      ],
    },
    video: { src: "", poster: "" },
    resources: [
      {
        title: "리서치 보고서 목차(샘플)",
        description: "내 조직에 맞게 수정해 쓰는 목차 샘플입니다.",
        code: `1. 요약(결론 먼저)
2. 배경/문제정의
3. 가설 및 검증 방법
4. 핵심 데이터/근거
5. 대안 비교(장단점)
6. 권고안 및 실행 계획
7. 리스크/추가 과제`,
      },
    ],
    files: [],
  },
  {
    id: "ai-mba-003",
    categoryId: "ai-basic",
    isNew: false,
    isPopular: true,
    title: "업무 프로세스 자동화: 반복 업무를 줄이는 설계",
    shortDescription:
      "반복 업무를 찾고, 자동화 우선순위를 정하고, 실제로 돌아가는 루틴으로 만드는 방법을 배웁니다.",
    priceKrw: 199000,
    durationDays: 60,
    startDate: "2026-04-01",
    thumbnailUrl: "",
    content: {
      overview:
        "엑셀/문서/메일/정리 같은 반복 업무를 자동화 후보로 만들고, 리스크 없이 작은 자동화부터 확장합니다.",
      bullets: [
        "업무 분해 → 자동화 후보 발굴",
        "자동화 ROI 계산(시간/비용/리스크)",
        "표준 운영 절차(SOP)와 체크리스트",
      ],
    },
    video: { src: "", poster: "" },
    resources: [],
    files: [
      {
        name: "자동화 체크리스트.txt",
        description: "업무 자동화 후보를 점검하는 체크리스트 예시",
        url: "#",
      },
    ],
  },
];

export const DEFAULT_CATEGORIES = [
  { id: "ai-basic", name: "AI 기초반", order: 1 },
  { id: "ai-office", name: "AI 직장인반", order: 2 },
  { id: "ai-business-basic", name: "비즈니스기초반", order: 3 },
  { id: "ai-business", name: "AI 비즈니스반", order: 4 },
  { id: "ai-job", name: "AI 취업준비반", order: 5 },
];

export function formatKrw(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "";
  return amount.toLocaleString("ko-KR") + "원";
}

export function getCourseById(id) {
  return COURSES.find((c) => c.id === id) || null;
}

