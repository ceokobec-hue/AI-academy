import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-functions.js";

import { firebaseConfig } from "./firebase-config.js";
import { formatKrw, getCourseById } from "./courses-data.js";

const CONFIG_PLACEHOLDER = "YOUR_";

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
  const functions = getFunctions(app, "asia-northeast3");
  return { auth, db, functions };
}

function qs() {
  return new URLSearchParams(window.location.search);
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

function renderHeader(course, { enrolled, accessBadgeLabel }) {
  const el = $("courseHeader");
  if (!el) return;

  el.innerHTML = `
    <h1 class="course-header-title">${esc(course.title)}</h1>
    <p class="course-desc" style="margin:0;">${esc(course.shortDescription)}</p>
    <div class="course-meta-row">
      ${
        enrolled
          ? `<span class="badge badge-success">${esc(accessBadgeLabel || "수강 중")}</span>`
          : `<span class="badge badge-primary">${formatKrw(course.priceKrw)}</span>`
      }
      <span>수강기간: ${course.durationDays}일</span>
      <span>개강일: ${course.startDate}</span>
    </div>
  `;
}

// 구독 고정 가격(전체 강의 오픈)
const SUB_MONTHLY = 99000;
const SUB_YEARLY = 890000;

function pricingRow(label, price, { tag, recommended } = {}) {
  const tagHtml = tag ? `<span class="plan-tag">${esc(tag)}</span>` : "";
  const recClass = recommended ? " plan-row--rec" : "";
  return `
    <div class="plan-row${recClass}">
      <div class="plan-label">${tagHtml}${esc(label)}</div>
      <div class="plan-price">${price > 0 ? formatKrw(price) : "-"}</div>
    </div>
  `;
}

function renderMeta(course, { enrolled, accessLabel }) {
  const el = $("courseMeta");
  if (!el) return;

  if (enrolled) {
    el.innerHTML = `
      <div class="side-meta-item"><span>상태</span><span>${esc(accessLabel || "수강 중")}</span></div>
      <div class="side-meta-item"><span>수강기간</span><span>${course.durationDays}일</span></div>
      <div class="side-meta-item"><span>개강일</span><span>${course.startDate}</span></div>
    `;
    return;
  }

  const p = course.pricing || {};
  el.innerHTML = `
    <div class="pricing-table">
      <h4 class="pricing-title">단품(이 강의만)</h4>
      ${pricingRow("30일", p.single30)}
      ${pricingRow("90일", p.single90, { recommended: true, tag: "추천" })}
      <h4 class="pricing-title" style="margin-top:14px;">카테고리(이 분야 전체)</h4>
      ${pricingRow("30일", p.category30)}
      ${pricingRow("90일", p.category90, { recommended: true, tag: "추천" })}
      <h4 class="pricing-title" style="margin-top:14px;">구독(전체 강의 오픈)</h4>
      ${pricingRow("월 구독", SUB_MONTHLY)}
      ${pricingRow("연 구독", SUB_YEARLY, { tag: "최저가" })}
    </div>
    <div class="side-meta" style="margin-top:12px;">
      <div class="side-meta-item"><span>수강기간</span><span>${course.durationDays}일</span></div>
      <div class="side-meta-item"><span>개강일</span><span>${course.startDate}</span></div>
    </div>
  `;
}

function renderCTA({ course, user, enrolled, accessBadgeLabel, functions }) {
  const el = $("courseCTA");
  if (!el) return;

  if (!user) {
    el.innerHTML = `
      <a class="btn btn-primary" href="./login.html">로그인 후 결제</a>
      <a class="btn btn-ghost" href="./signup.html">회원가입</a>
    `;
    return;
  }

  if (enrolled) {
    el.innerHTML = `
      <span class="badge badge-success">${esc(accessBadgeLabel || "수강 중")}</span>
      <a class="btn btn-primary" href="#courseVideo">영상 보러가기</a>
    `;
    return;
  }

  const p = course.pricing || {};

  el.innerHTML = `
    <div class="plan-buttons">
      <button class="btn btn-ghost btn-sm" type="button" data-plan="single30" data-price="${p.single30}">단품 30일 · ${formatKrw(p.single30)}</button>
      <button class="btn btn-primary btn-sm" type="button" data-plan="single90" data-price="${p.single90}">단품 90일 · ${formatKrw(p.single90)}<span class="plan-rec-badge">추천</span></button>
      ${p.category30 ? `<button class="btn btn-ghost btn-sm" type="button" data-plan="category30" data-price="${p.category30}">카테고리 30일 · ${formatKrw(p.category30)}</button>` : ""}
      ${p.category90 ? `<button class="btn btn-primary btn-sm" type="button" data-plan="category90" data-price="${p.category90}">카테고리 90일 · ${formatKrw(p.category90)}<span class="plan-rec-badge">추천</span></button>` : ""}
      <button class="btn btn-ghost btn-sm" type="button" data-plan="sub_monthly" data-price="${SUB_MONTHLY}">월 구독 · ${formatKrw(SUB_MONTHLY)}</button>
      <button class="btn btn-ghost btn-sm" type="button" data-plan="sub_yearly" data-price="${SUB_YEARLY}">연 구독 · ${formatKrw(SUB_YEARLY)}<span class="plan-rec-badge">최저가</span></button>
    </div>
    <p class="hint" style="margin-top:10px;">결제 후 바로 수강이 시작됩니다.</p>
  `;

  el.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-plan]");
    if (!btn) return;
    const plan = btn.dataset.plan;

    // 버튼 비활성화 (중복 클릭 방지)
    const allBtns = el.querySelectorAll("button[data-plan]");
    allBtns.forEach((b) => { b.disabled = true; });
    btn.textContent = "결제 준비 중…";

    try {
      const createCheckout = httpsCallable(functions, "createCheckoutSession");
      const result = await createCheckout({ plan, courseId: course.id });
      const url = result.data?.url;
      if (url) {
        window.location.href = url; // Stripe Checkout 페이지로 이동
      } else {
        throw new Error("결제 URL을 받지 못했습니다.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert(`결제 세션 생성에 실패했습니다.\n${err.message || err}`);
      allBtns.forEach((b) => { b.disabled = false; });
      // 버튼 텍스트 원복은 re-render가 낫지만, 간단 처리
      btn.textContent = `${plan} · ${formatKrw(Number(btn.dataset.price || 0))}`;
    }
  });
}

function renderVideo({ course, user, enrolled }) {
  const el = $("courseVideo");
  if (!el) return;

  if (!user || !enrolled) {
    el.innerHTML = `
      <div class="locked">
        <p class="locked-title">수강 신청 후 시청 가능</p>
        <p class="locked-sub">로그인 후 수강 신청을 완료하면 교육 영상을 시청할 수 있어요.</p>
      </div>
    `;
    return;
  }

  if (!course.video?.src) {
    el.innerHTML = `
      <div class="locked">
        <p class="locked-title">영상 준비 중</p>
        <p class="locked-sub">영상 업로드 후 이 영역에 재생기가 표시됩니다.</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <video controls playsinline ${course.video.poster ? `poster="${esc(course.video.poster)}"` : ""}>
      <source src="${esc(course.video.src)}" />
      브라우저가 video 태그를 지원하지 않습니다.
    </video>
  `;
}

function renderContent(unit) {
  const el = $("courseContent");
  if (!el) return;

  const bullets = (unit.content?.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("");
  el.innerHTML = `
    <p style="margin:0;">${esc(unit.content?.overview || "")}</p>
    ${bullets ? `<ul style="margin:12px 0 0; padding-left: 1.2em;">${bullets}</ul>` : ""}
  `;
}

function renderResources(unit, { user, enrolled }) {
  const el = $("courseResources");
  if (!el) return;

  if (!user || !enrolled) {
    el.innerHTML = `
      <div class="locked">
        <p class="locked-title">수강 신청 후 열람 가능</p>
        <p class="locked-sub">코드/자료는 수강 신청 후 확인할 수 있어요.</p>
      </div>
    `;
    return;
  }

  const items = unit.resources || [];
  if (!items.length) {
    el.innerHTML = `<p class="muted" style="margin:0;">자료가 아직 없습니다.</p>`;
    return;
  }

  el.innerHTML = items
    .map((r) => {
      return `
        <div class="file-item">
          <div style="font-weight:900;">${esc(r.title)}</div>
          <div class="muted">${esc(r.description || "")}</div>
          ${r.code ? `<pre><code>${esc(r.code)}</code></pre>` : ""}
        </div>
      `;
    })
    .join("");
}

function renderFiles(unit, { user, enrolled }) {
  const el = $("courseFiles");
  if (!el) return;

  if (!user || !enrolled) {
    el.innerHTML = `
      <div class="locked">
        <p class="locked-title">수강 신청 후 다운로드 가능</p>
        <p class="locked-sub">첨부파일은 수강 신청 후 다운로드할 수 있어요.</p>
      </div>
    `;
    return;
  }

  const files = unit.files || [];
  if (!files.length) {
    el.innerHTML = `<p class="muted" style="margin:0;">첨부파일이 아직 없습니다.</p>`;
    return;
  }
  el.innerHTML = files
    .map(
      (f) => `
      <div class="file-item">
        <a href="${esc(f.url || "#")}" download>${esc(f.name)}</a>
        <div class="muted">${esc(f.description || "")}</div>
      </div>
    `,
    )
    .join("");
}

function tsToMillis(v) {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

function isActiveUntil(expiresAt) {
  const ms = tsToMillis(expiresAt);
  if (!ms) return true; // 만료가 없으면(레거시/테스트) 활성으로 취급
  return ms > Date.now();
}

async function checkEnrolled({ uid, courseId, db }) {
  const snap = await getDoc(doc(db, "users", uid, "enrollments", courseId));
  if (!snap.exists()) return false;
  const data = snap.data() || {};
  // expiresAt가 있으면 만료 체크
  if ("expiresAt" in data) return isActiveUntil(data.expiresAt);
  return true;
}

function getCategoryPassEntry(ent, categoryId) {
  const pass = ent?.categoryPass || {};
  if (!categoryId) return null;
  return pass?.[categoryId] || null;
}

function isCategoryPassActive(ent, categoryId) {
  const entry = getCategoryPassEntry(ent, categoryId);
  if (!entry) return false;
  // entry 형태: { expiresAt: Timestamp } 또는 Timestamp 자체도 허용
  const expiresAt = entry.expiresAt || entry;
  return isActiveUntil(expiresAt);
}

function computeAccessLabel({ enrolledDoc, inviteUnlocked, categoryPassActive, subscriptionActive }) {
  if (inviteUnlocked) return "무료 오픈";
  if (subscriptionActive) return "전체 이용권";
  if (categoryPassActive) return "카테고리 이용권";
  if (enrolledDoc) return "수강 중";
  return "";
}

async function enrollTest({ uid, course, db }) {
  await setDoc(
    doc(db, "users", uid, "enrollments", course.id),
    {
      status: "active",
      courseId: course.id,
      courseTitle: course.title,
      enrolledAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function renderNotFound() {
  const header = $("courseHeader");
  header?.classList.add("card");
  if (header) header.style.padding = "18px";
  if (header) header.innerHTML = `<p style="margin:0;font-weight:900;">강의를 찾을 수 없습니다.</p>`;
}

async function fetchCourseFromFirestore(db, id) {
  try {
    const snap = await getDoc(doc(db, "courses", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.warn("Failed to fetch course from Firestore, falling back.", e);
    return null;
  }
}

function normalizeCourse(c, idFallback) {
  if (!c) return null;
  const p = c.pricing || {};
  return {
    id: String(c.id || idFallback || ""),
    title: String(c.title || ""),
    shortDescription: String(c.shortDescription || ""),
    priceKrw: Number(c.priceKrw || 0),
    durationDays: Number(c.durationDays || 0),
    startDate: String(c.startDate || ""),
    thumbnailUrl: String(c.thumbnailUrl || ""),
    categoryId: String(c.categoryId || ""),
    isNew: !!c.isNew,
    isPopular: !!c.isPopular,
    inviteFreeOpen: !!c.inviteFreeOpen,
    published: c.published !== false,
    video: c.video || { src: "", poster: "" },
    content: c.content || { overview: "", bullets: [] },
    resources: Array.isArray(c.resources) ? c.resources : [],
    files: Array.isArray(c.files) ? c.files : [],
    pricing: {
      single30: Number(p.single30 || c.priceKrw || 0),
      single90: Number(p.single90 || 0),
      category30: Number(p.category30 || 0),
      category90: Number(p.category90 || 0),
    },
  };
}

function normalizeLesson(l, idFallback, orderFallback) {
  if (!l) return null;
  return {
    id: String(l.id || idFallback || ""),
    order: Number.isFinite(Number(l.order)) ? Number(l.order) : Number(orderFallback || 0),
    title: String(l.title || ""),
    video: l.video || { src: "", poster: "" },
    content: l.content || { overview: "", bullets: [] },
    resources: Array.isArray(l.resources) ? l.resources : [],
    files: Array.isArray(l.files) ? l.files : [],
  };
}

async function fetchLessonsFromFirestore(db, courseId) {
  try {
    const q = query(collection(db, "courses", courseId, "lessons"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d, idx) => normalizeLesson({ id: d.id, ...d.data() }, d.id, idx + 1)).filter(Boolean);
  } catch (e) {
    console.warn("Failed to fetch lessons.", e);
    return [];
  }
}

function getSelectedLessonParam() {
  return qs().get("l") || "";
}

function setSelectedLessonParam(value) {
  const url = new URL(window.location.href);
  if (!value) url.searchParams.delete("l");
  else url.searchParams.set("l", value);
  window.history.replaceState({}, "", url.toString());
}

function animateSwap(dir) {
  const ids = ["courseVideo", "courseContent", "courseResources", "courseFiles"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("lesson-anim");
    el.removeAttribute("data-dir");
    // force reflow
    void el.offsetWidth;
    el.classList.add("lesson-anim");
    el.dataset.dir = dir;
    window.setTimeout(() => {
      el.classList.remove("lesson-anim");
      el.removeAttribute("data-dir");
    }, 260);
  });
}

function renderLessonNavMobileChips({ lessons, selectedId, onSelect }) {
  const wrap = $("lessonNavMobile");
  if (!wrap) return;
  wrap.innerHTML = lessons
    .map((l, idx) => {
      const active = l.id === selectedId ? "is-active" : "";
      const label = l.title || `${idx + 1}강`;
      return `<button class="lesson-chip ${active}" type="button" data-lesson-id="${esc(l.id)}">${esc(label)}</button>`;
    })
    .join("");

  wrap.querySelectorAll("[data-lesson-id]").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.getAttribute("data-lesson-id") || "", "next"));
  });
}

function renderLessonOutlineDesktop({ lessons, selectedId, onSelect }) {
  const wrap = $("lessonOutline");
  const card = $("lessonOutlineCard");
  if (!wrap || !card) return;
  if (!lessons.length) {
    card.style.display = "none";
    return;
  }
  card.style.display = "";

  wrap.innerHTML = lessons
    .map((l, idx) => {
      const active = l.id === selectedId ? "is-active" : "";
      const title = l.title || `${idx + 1}강`;
      return `
        <div class="lesson-outline-item ${active}" role="button" tabindex="0" data-lesson-id="${esc(l.id)}">
          <div class="lesson-outline-title">${esc(title)}</div>
          <div class="lesson-outline-sub">레슨 ${idx + 1}</div>
        </div>
      `;
    })
    .join("");

  const bind = (el) => {
    el.addEventListener("click", () => onSelect(el.getAttribute("data-lesson-id") || "", "next"));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(el.getAttribute("data-lesson-id") || "", "next");
      }
    });
  };
  wrap.querySelectorAll("[data-lesson-id]").forEach(bind);
}

function updateLessonNow({ lessons, selectedIndex }) {
  const el = $("lessonNow");
  if (!el) return;
  if (!lessons.length) {
    el.textContent = "";
    return;
  }
  el.textContent = `${selectedIndex + 1} / ${lessons.length}`;
}

async function boot() {
  const id = qs().get("id") || "";
  const fb = ensureFirebase();
  let course = null;
  let lessons = [];
  let selectedId = "";
  let currentUser = null;
  let currentEnrolled = false;

  if (fb) {
    const fromDb = await fetchCourseFromFirestore(fb.db, id);
    course = normalizeCourse(fromDb, id);
    lessons = await fetchLessonsFromFirestore(fb.db, id);
  }

  if (!course) {
    course = normalizeCourse(getCourseById(id), id);
  }

  if (!course) {
    renderNotFound();
    return;
  }

  // Fallback lesson when lessons are missing
  if (!lessons.length) {
    lessons = [
      normalizeLesson(
        {
          id: "main",
          order: 1,
          title: "레슨 1",
          video: course.video,
          content: course.content,
          resources: course.resources,
          files: course.files,
        },
        "main",
        1,
      ),
    ].filter(Boolean);
  }

  const pickInitial = () => {
    const p = getSelectedLessonParam();
    if (p) {
      const exact = lessons.find((l) => l.id === p);
      if (exact) return exact.id;
      // allow numeric index (1-based)
      const n = Number(p);
      if (Number.isFinite(n) && n >= 1 && n <= lessons.length) return lessons[n - 1].id;
    }
    return lessons[0]?.id || "";
  };
  selectedId = pickInitial();
  if (selectedId) setSelectedLessonParam(selectedId);

  const selectLesson = (nextId, dir = "next") => {
    if (!nextId || nextId === selectedId) return;
    selectedId = nextId;
    setSelectedLessonParam(selectedId);
    animateSwap(dir);
    renderAll();
  };

  const getSelectedIndex = () => lessons.findIndex((l) => l.id === selectedId);
  const getSelectedLesson = () => lessons.find((l) => l.id === selectedId) || lessons[0] || null;

  const renderAll = () => {
    const idx = Math.max(0, getSelectedIndex());
    const lesson = getSelectedLesson();
    updateLessonNow({ lessons, selectedIndex: idx });
    renderLessonNavMobileChips({
      lessons,
      selectedId,
      onSelect: (id2, dir) => selectLesson(id2, dir),
    });
    renderLessonOutlineDesktop({
      lessons,
      selectedId,
      onSelect: (id2, dir) => selectLesson(id2, dir),
    });

    if (lesson) {
      renderContent(lesson);
      renderResources(lesson, { user: currentUser, enrolled: currentEnrolled });
      renderFiles(lesson, { user: currentUser, enrolled: currentEnrolled });
      renderVideo({ course: lesson, user: currentUser, enrolled: currentEnrolled });
    }
  };

  document.getElementById("btnLessonPrev")?.addEventListener("click", () => {
    const idx = getSelectedIndex();
    if (idx <= 0) return;
    selectLesson(lessons[idx - 1].id, "prev");
  });
  document.getElementById("btnLessonNext")?.addEventListener("click", () => {
    const idx = getSelectedIndex();
    if (idx < 0 || idx >= lessons.length - 1) return;
    selectLesson(lessons[idx + 1].id, "next");
  });

  // Default (logged out)
  renderHeader(course, { enrolled: false, accessBadgeLabel: "" });
  renderMeta(course, { enrolled: false, accessLabel: "" });
  renderCTA({ course, user: null, enrolled: false, accessBadgeLabel: "", functions: null });
  currentUser = null;
  currentEnrolled = false;
  renderAll();

  if (!fb) return;
  const { auth, db, functions } = fb;

  // 결제 성공/취소 URL 파라미터 처리
  const paymentStatus = qs().get("payment");
  if (paymentStatus === "success") {
    try { window.showToast({ title: "결제 완료", message: "결제가 완료되었습니다! 수강이 시작됩니다." }); } catch { /* ignore */ }
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("payment");
    window.history.replaceState({}, "", cleanUrl.toString());
  } else if (paymentStatus === "cancel") {
    try { window.showToast({ title: "결제 취소", message: "결제가 취소되었습니다." }); } catch { /* ignore */ }
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("payment");
    window.history.replaceState({}, "", cleanUrl.toString());
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      currentEnrolled = false;
      renderHeader(course, { enrolled: false, accessBadgeLabel: "" });
      renderMeta(course, { enrolled: false, accessLabel: "" });
      renderCTA({ course, user: null, enrolled: false, accessBadgeLabel: "", functions: null });
      renderAll();
      return;
    }

    let enrolledDoc = false;
    try {
      enrolledDoc = await checkEnrolled({ uid: user.uid, courseId: course.id, db });
    } catch (e) {
      console.error(e);
      enrolledDoc = false;
    }
    // entitlements는 여기서 1번만 읽어서 재사용
    let ent = {};
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      ent = userSnap.exists() ? (userSnap.data()?.entitlements || {}) : {};
    } catch { /* ignore */ }

    const inviteVerified = ent.inviteVerified === true;
    const inviteUnlocked = !enrolledDoc && inviteVerified && !!course.inviteFreeOpen;
    const categoryPassActive = isCategoryPassActive(ent, course.categoryId);

    // (참고) 구독은 나중에 빼더라도, 엔타이틀먼트 구조는 유지해도 됩니다.
    const subscriptionActive = ent.subscriptionActive === true && isActiveUntil(ent.subscriptionExpiresAt);

    const finalEnrolled = enrolledDoc || inviteUnlocked || categoryPassActive || subscriptionActive;
    const accessLabel = computeAccessLabel({ enrolledDoc, inviteUnlocked, categoryPassActive, subscriptionActive });

    currentUser = user;
    currentEnrolled = finalEnrolled;
    renderHeader(course, { enrolled: finalEnrolled, accessBadgeLabel: accessLabel });
    renderMeta(course, { enrolled: finalEnrolled, accessLabel });
    renderCTA({
      course,
      user,
      enrolled: finalEnrolled,
      accessBadgeLabel: accessLabel,
      functions,
    });
    renderAll();
  });
}

document.addEventListener("DOMContentLoaded", boot);

