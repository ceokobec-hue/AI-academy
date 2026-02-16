import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import {
  DEMO_BOARD_ITEMS,
  DEMO_SCHEDULE_EVENTS,
  DEMO_SCHEDULE_RULES,
} from "./home-data.js";

const CONFIG_PLACEHOLDER = "YOUR_";
const ADMIN_EMAIL = "mentor0329@hanmail.net";

function isConfigReady(cfg) {
  if (!cfg) return false;
  const requiredKeys = ["apiKey", "authDomain", "projectId"];
  return requiredKeys.every((k) => {
    const v = cfg[k];
    return typeof v === "string" && v.length > 0 && !v.includes(CONFIG_PLACEHOLDER);
  });
}

function ensureFirebase() {
  if (!isConfigReady(firebaseConfig)) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return { auth, db };
}

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isAdmin(user) {
  return typeof user?.email === "string" && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function toDateOnly(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateYmd(ymd) {
  // ymd: "YYYY-MM-DD"
  const [y, m, d] = String(ymd || "").split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function parseTimeHM(hm) {
  const [h, m] = String(hm || "").split(":").map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

function parseTs(ts) {
  if (!ts) return null;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (ts.toDate) return ts.toDate();
  return null;
}

function addMinutes(d, minutes) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + minutes);
  return x;
}

function daysDiff(a, b) {
  const aa = toDateOnly(a).getTime();
  const bb = toDateOnly(b).getTime();
  return Math.round((bb - aa) / 86400000);
}

function badgeTextForStart(start) {
  const now = new Date();
  const d = daysDiff(now, start);
  if (d === 0) return `오늘 ${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
  if (d > 0) return `D-${d}`;
  return "진행/지난 일정";
}

function typeDotClass(type) {
  if (type === "special") return "dot-special";
  if (type === "deadline") return "dot-deadline";
  return "dot-live";
}

function normalizeRule(docLike) {
  const r = docLike || {};
  return {
    id: String(r.id || ""),
    title: String(r.title || ""),
    type: String(r.type || "live"),
    weekdays: Array.isArray(r.weekdays) ? r.weekdays.map((x) => Number(x)).filter((n) => n >= 0 && n <= 6) : [],
    time: String(r.time || "19:00"),
    durationMinutes: Number(r.durationMinutes || 60),
    startDate: String(r.startDate || ""),
    endDate: String(r.endDate || ""),
    teacher: String(r.teacher || ""),
    place: String(r.place || ""),
  };
}

function normalizeEvent(docLike) {
  const e = docLike || {};
  return {
    id: String(e.id || ""),
    title: String(e.title || ""),
    type: String(e.type || "live"),
    startAt: parseTs(e.startAt),
    endAt: parseTs(e.endAt),
    teacher: String(e.teacher || ""),
    place: String(e.place || ""),
  };
}

function buildOccurrencesForMonth({ rules, monthDate }) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);

  const occ = [];

  for (const raw of rules) {
    const r = normalizeRule(raw);
    if (!r.title || r.weekdays.length === 0) continue;
    const startBound = parseDateYmd(r.startDate) || new Date(year - 1, 0, 1);
    const endBound = parseDateYmd(r.endDate) || new Date(year + 2, 11, 31);
    const time = parseTimeHM(r.time) || { h: 19, m: 0 };

    // iterate days in month and match weekday
    for (let day = 1; day <= endOfMonth.getDate(); day++) {
      const d = new Date(year, month, day, time.h, time.m, 0, 0);
      const dow = d.getDay();
      if (!r.weekdays.includes(dow)) continue;
      if (d < startBound) continue;
      if (d > endBound) continue;

      occ.push({
        id: `${r.id}_${formatYmd(d)}`,
        title: r.title,
        type: r.type,
        startAt: d,
        endAt: addMinutes(d, r.durationMinutes || 60),
        teacher: r.teacher,
        place: r.place,
        source: "rule",
      });
    }
  }

  // sort
  occ.sort((a, b) => a.startAt - b.startAt);
  return occ;
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const startDow = first.getDay(); // 0..6
  const totalCells = Math.ceil((startDow + last.getDate()) / 7) * 7; // full weeks

  const days = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1;
    const d = new Date(year, month, dayNum);
    const inMonth = dayNum >= 1 && dayNum <= last.getDate();
    days.push({ date: d, inMonth });
  }
  return days;
}

// upcoming filters (라이브/현장/스터디)
let upcomingFilterType = ""; // "" means no filter (전체)
let lastUpcomingAll = []; // cached future events in current month

function setScheduleFilterActiveUI() {
  const wrap = $("scheduleFilters");
  if (!wrap) return;
  const btns = [...wrap.querySelectorAll("button[data-upcoming-type]")];
  for (const b of btns) {
    const t = String(b.getAttribute("data-upcoming-type") || "");
    b.classList.toggle("is-active", !!upcomingFilterType && t === upcomingFilterType);
    b.setAttribute("aria-pressed", String(!!upcomingFilterType && t === upcomingFilterType));
  }
}

function renderUpcomingHTML(list) {
  return list.length
    ? list
        .map((e) => {
          const badge = badgeTextForStart(e.startAt);
          const time = `${pad2(e.startAt.getHours())}:${pad2(e.startAt.getMinutes())}`;
          const meta = `${e.startAt.getMonth() + 1}/${e.startAt.getDate()} ${time}`;
          const sub = [e.teacher, e.place].filter(Boolean).join(" · ");
          return `
            <div class="up-item">
              <div class="up-left">
                <div class="up-title">
                  <span class="badge badge-primary">${esc(badge)}</span>
                  <span class="up-dot ${typeDotClass(e.type)}"></span>
                  ${esc(e.title)}
                </div>
                <div class="up-sub">${esc(meta)}${sub ? ` · ${esc(sub)}` : ""}</div>
              </div>
            </div>
          `;
        })
        .join("")
    : "";
}

function renderUpcomingFromCache() {
  const listEl = $("upcomingList");
  if (!listEl) return;

  const filtered = upcomingFilterType
    ? lastUpcomingAll.filter((e) => String(e.type) === String(upcomingFilterType))
    : lastUpcomingAll;

  const shown = filtered.slice(0, 7);

  if (!lastUpcomingAll.length) {
    listEl.innerHTML = `<div class="empty-card card">이번 달 일정 준비 중이야. 곧 올릴게!</div>`;
    return;
  }
  if (upcomingFilterType && !filtered.length) {
    listEl.innerHTML = `<div class="empty-card card">선택한 타입의 “다가오는 수업”이 아직 없어요.</div>`;
    return;
  }

  listEl.innerHTML = renderUpcomingHTML(shown);
}

function scrollToUpcoming() {
  const el = $("upcomingSection") || document.querySelector(".upcoming");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function wireScheduleFilters() {
  const wrap = $("scheduleFilters");
  if (!wrap || wrap.dataset.wired === "1") return;
  wrap.dataset.wired = "1";

  setScheduleFilterActiveUI();

  wrap.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-upcoming-type]");
    if (!btn) return;
    const t = String(btn.getAttribute("data-upcoming-type") || "");
    if (!t) return;

    // toggle (same button -> 전체 보기)
    upcomingFilterType = upcomingFilterType === t ? "" : t;
    setScheduleFilterActiveUI();
    renderUpcomingFromCache();
    scrollToUpcoming();
  });
}

function renderCalendar({ monthDate, occurrences, oneOffEvents }) {
  const all = [...occurrences, ...oneOffEvents].filter((e) => e.startAt);
  all.sort((a, b) => a.startAt - b.startAt);

  const byYmd = new Map();
  for (const e of all) {
    const ymd = formatYmd(e.startAt);
    if (!byYmd.has(ymd)) byYmd.set(ymd, []);
    byYmd.get(ymd).push(e);
  }

  $("calTitle").textContent = `${monthDate.getFullYear()}년 ${monthDate.getMonth() + 1}월`;

  const todayYmd = formatYmd(new Date());
  const days = buildCalendarDays(monthDate);
  const grid = $("calGrid");

  grid.innerHTML = days
    .map(({ date, inMonth }) => {
      const ymd = formatYmd(date);
      const list = byYmd.get(ymd) || [];
      const isToday = ymd === todayYmd;
      const top = list.slice(0, 2);
      const more = list.length > 2 ? `<div class="cal-more">+${list.length - 2}개</div>` : "";

      const chips = top
        .map(
          (e) => `
            <div class="cal-chip ${typeDotClass(e.type)}">
              <span class="cal-chip-dot"></span>
              <span class="cal-chip-text">${esc(e.title)}</span>
            </div>
          `,
        )
        .join("");

      return `
        <div class="cal-cell ${inMonth ? "" : "is-muted"} ${isToday ? "is-today" : ""}">
          <div class="cal-date">${date.getDate()}</div>
          <div class="cal-items">
            ${chips}
            ${more}
          </div>
        </div>
      `;
    })
    .join("");

  // upcoming list (next 7) + filter buttons
  lastUpcomingAll = all.filter((e) => e.startAt >= new Date());
  setScheduleFilterActiveUI();
  renderUpcomingFromCache();
}

function ddayForDeadline(deadlineAt) {
  const d = parseTs(deadlineAt);
  if (!d) return "";
  const now = new Date();
  const diff = daysDiff(now, d);
  if (diff === 0) return "오늘 마감";
  if (diff > 0) return `D-${diff}`;
  return "마감";
}

function renderBoard(items) {
  const notice = items.filter((x) => x.board === "notice");
  const recruit = items.filter((x) => x.board === "recruit");
  const review = items.filter((x) => x.board === "review");

  const map = {
    notice: $("boardNotice"),
    recruit: $("boardRecruit"),
    review: $("boardReview"),
  };

  function card(item) {
    const link = item.linkUrl ? `<a class="board-link" href="${esc(item.linkUrl)}">자세히</a>` : "";
    const cap =
      item.board === "recruit" && Number.isFinite(Number(item.capacity))
        ? `<span class="mini">정원 ${Number(item.capacity)} / 남은 ${Number(item.remaining ?? "")}</span>`
        : "";
    const dday = item.board === "recruit" && item.deadlineAt ? `<span class="badge badge-primary">${esc(ddayForDeadline(item.deadlineAt))}</span>` : "";

    return `
      <article class="board-item">
        <div class="board-title-row">
          ${dday}
          <div class="board-title">${esc(item.title || "")}</div>
        </div>
        <div class="board-body">${esc(item.body || "")}</div>
        <div class="board-meta">
          ${cap}
          ${link}
        </div>
      </article>
    `;
  }

  map.notice.innerHTML = notice.length ? notice.slice(0, 5).map(card).join("") : `<div class="empty-mini">공지 없음</div>`;
  map.recruit.innerHTML = recruit.length ? recruit.slice(0, 5).map(card).join("") : `<div class="empty-mini">모집 없음</div>`;
  map.review.innerHTML = review.length ? review.slice(0, 5).map(card).join("") : `<div class="empty-mini">후기 없음</div>`;
}

function renderScheduleAdminActions(user) {
  const wrap = $("scheduleAdminActions");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!user || !isAdmin(user)) return;

  wrap.innerHTML = `
    <a class="btn btn-primary btn-sm" href="./admin-schedule.html">일정 등록</a>
  `;
}

async function fetchScheduleRules(db) {
  const q = query(collection(db, "scheduleRules"), orderBy("title", "asc"), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchScheduleEventsForMonth(db, monthDate) {
  // We keep events query simple: fetch recent future events and filter client-side
  const now = new Date();
  const q = query(collection(db, "scheduleEvents"), where("startAt", ">=", now), orderBy("startAt", "asc"), limit(200));
  const snap = await getDocs(q);
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() })).map(normalizeEvent);
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  return events.filter((e) => e.startAt && e.startAt.getFullYear() === y && e.startAt.getMonth() === m);
}

async function fetchBoardItems(db) {
  const q = query(collection(db, "boardItems"), orderBy("createdAt", "desc"), limit(30));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function boot() {
  const fb = ensureFirebase();
  let monthDate = new Date();
  monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);

  let currentUser = null;
  wireScheduleFilters();

  async function renderAll() {
    if (!fb) {
      const occ = buildOccurrencesForMonth({ rules: DEMO_SCHEDULE_RULES, monthDate });
      const ev = DEMO_SCHEDULE_EVENTS.map(normalizeEvent).filter((x) => x.startAt && x.startAt.getMonth() === monthDate.getMonth());
      renderCalendar({ monthDate, occurrences: occ, oneOffEvents: ev });
      renderBoard(DEMO_BOARD_ITEMS);
      return;
    }

    const [rules, board] = await Promise.all([
      fetchScheduleRules(fb.db).catch(() => []),
      fetchBoardItems(fb.db).catch(() => []),
    ]);

    const occ = buildOccurrencesForMonth({ rules, monthDate });
    const ev = await fetchScheduleEventsForMonth(fb.db, monthDate).catch(() => []);
    renderCalendar({ monthDate, occurrences: occ, oneOffEvents: ev });
    renderBoard(board);
  }

  $("calPrev")?.addEventListener("click", async () => {
    monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
    await renderAll();
  });
  $("calNext")?.addEventListener("click", async () => {
    monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    await renderAll();
  });

  if (fb) {
    onAuthStateChanged(fb.auth, async (user) => {
      currentUser = user;
      renderScheduleAdminActions(user);
      await renderAll();
      if (user && isAdmin(user)) {
        // later: show admin shortcut buttons near schedule/board
      }
    });
  } else {
    renderScheduleAdminActions(null);
  }

  await renderAll();
}

document.addEventListener("DOMContentLoaded", boot);

