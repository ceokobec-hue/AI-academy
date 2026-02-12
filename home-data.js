export const DEMO_SCHEDULE_RULES = [
  {
    id: "rule_weekly_prompt",
    title: "라이브 수업: 프롬프트 기초",
    type: "live", // live | special | deadline
    weekdays: [2, 4], // 0=일 ... 6=토
    time: "19:00",
    durationMinutes: 90,
    startDate: "2026-02-01",
    endDate: "2026-12-31",
    teacher: "김지백",
    place: "Zoom",
  },
  {
    id: "rule_weekly_report",
    title: "실무반: 보고서 자동화",
    type: "live",
    weekdays: [1],
    time: "20:30",
    durationMinutes: 80,
    startDate: "2026-02-01",
    endDate: "2026-12-31",
    teacher: "김지백",
    place: "Zoom",
  },
];

export const DEMO_SCHEDULE_EVENTS = [
  {
    id: "event_special_1",
    title: "특강: 대표님을 위한 AI업무 루틴",
    type: "special",
    startAt: "2026-02-15T19:00:00+09:00",
    endAt: "2026-02-15T20:30:00+09:00",
    teacher: "김지백",
    place: "Zoom",
  },
  {
    id: "event_deadline_1",
    title: "과제 마감: 1주차 결과물 제출",
    type: "deadline",
    startAt: "2026-02-09T23:59:00+09:00",
    endAt: "2026-02-09T23:59:00+09:00",
  },
];

export const DEMO_BOARD_ITEMS = [
  {
    id: "notice_1",
    board: "notice",
    title: "공지: 커뮤니티 오픈!",
    body: "오늘의 미션 인증하고 질문 올려봐.",
    createdAt: "2026-02-10T10:00:00+09:00",
  },
  {
    id: "recruit_1",
    board: "recruit",
    title: "모집: 실무반(보고서 자동화) 2기",
    body: "월요일 20:30 라이브. 정원 20명.",
    capacity: 20,
    remaining: 5,
    deadlineAt: "2026-02-20T23:59:00+09:00",
    createdAt: "2026-02-10T10:00:00+09:00",
  },
  {
    id: "review_1",
    board: "review",
    title: "후기: 보고서 작성 시간이 반으로 줄었어요",
    body: "템플릿 + 자동화로 주간보고가 10분 컷!",
    linkUrl: "./course.html",
    createdAt: "2026-02-08T10:00:00+09:00",
  },
];

