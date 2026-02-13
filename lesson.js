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
  return { auth, db };
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

function renderHeader(course, { enrolled }) {
  const el = $("courseHeader");
  if (!el) return;

  el.innerHTML = `
    <h1 class="course-header-title">${esc(course.title)}</h1>
    <p class="course-desc" style="margin:0;">${esc(course.shortDescription)}</p>
    <div class="course-meta-row">
      ${
        enrolled
          ? `<span class="badge badge-success">수강 중</span>`
          : `<span class="badge badge-primary">${formatKrw(course.priceKrw)}</span>`
      }
      <span>수강기간: ${course.durationDays}일</span>
      <span>개강일: ${course.startDate}</span>
    </div>
  `;
}

function renderMeta(course, { enrolled }) {
  const el = $("courseMeta");
  if (!el) return;

  el.innerHTML = `
    <div class="side-meta-item"><span>가격</span><span>${
      enrolled ? "수강 중" : formatKrw(course.priceKrw)
    }</span></div>
    <div class="side-meta-item"><span>수강기간</span><span>${course.durationDays}일</span></div>
    <div class="side-meta-item"><span>개강일</span><span>${course.startDate}</span></div>
  `;
}

function renderCTA({ course, user, enrolled, onEnroll }) {
  const el = $("courseCTA");
  if (!el) return;

  if (!user) {
    el.innerHTML = `
      <a class="btn btn-primary" href="./login.html">로그인 후 수강 신청</a>
      <a class="btn btn-ghost" href="./signup.html">회원가입</a>
    `;
    return;
  }

  if (enrolled) {
    el.innerHTML = `
      <span class="badge badge-success">수강 중</span>
      <a class="btn btn-primary" href="#courseVideo">영상 보러가기</a>
    `;
    return;
  }

  el.innerHTML = `
    <button class="btn btn-primary" type="button" id="btnEnrollTest">수강 신청(테스트)</button>
    <a class="btn btn-ghost" href="./course.html">다른 강의 보기</a>
  `;

  document.getElementById("btnEnrollTest")?.addEventListener("click", onEnroll);
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

async function checkEnrolled({ uid, courseId, db }) {
  const snap = await getDoc(doc(db, "users", uid, "enrollments", courseId));
  return snap.exists();
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
    published: c.published !== false,
    video: c.video || { src: "", poster: "" },
    content: c.content || { overview: "", bullets: [] },
    resources: Array.isArray(c.resources) ? c.resources : [],
    files: Array.isArray(c.files) ? c.files : [],
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
  renderHeader(course, { enrolled: false });
  renderMeta(course, { enrolled: false });
  renderCTA({ course, user: null, enrolled: false, onEnroll: () => {} });
  currentUser = null;
  currentEnrolled = false;
  renderAll();

  if (!fb) return;
  const { auth, db } = fb;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      currentEnrolled = false;
      renderHeader(course, { enrolled: false });
      renderMeta(course, { enrolled: false });
      renderCTA({ course, user: null, enrolled: false, onEnroll: () => {} });
      renderAll();
      return;
    }

    let enrolled = false;
    try {
      enrolled = await checkEnrolled({ uid: user.uid, courseId: course.id, db });
    } catch (e) {
      console.error(e);
      enrolled = false;
    }

    const refresh = async () => {
      try {
        enrolled = await checkEnrolled({ uid: user.uid, courseId: course.id, db });
      } catch {
        enrolled = false;
      }

      currentUser = user;
      currentEnrolled = enrolled;
      renderHeader(course, { enrolled });
      renderMeta(course, { enrolled });
      renderCTA({
        course,
        user,
        enrolled,
        onEnroll: async () => {
          try {
            await enrollTest({ uid: user.uid, course, db });
          } catch (e) {
            console.error(e);
            alert("수강 신청에 실패했습니다. Firestore 규칙/권한을 확인해 주세요.");
            return;
          }
          await refresh();
          document.getElementById("courseVideo")?.scrollIntoView({ behavior: "smooth" });
        },
      });
      renderAll();
    };

    await refresh();
  });
}

document.addEventListener("DOMContentLoaded", boot);

