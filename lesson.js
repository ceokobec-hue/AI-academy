import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
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

function renderContent(course) {
  const el = $("courseContent");
  if (!el) return;

  const bullets = (course.content?.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("");
  el.innerHTML = `
    <p style="margin:0;">${esc(course.content?.overview || "")}</p>
    ${bullets ? `<ul style="margin:12px 0 0; padding-left: 1.2em;">${bullets}</ul>` : ""}
  `;
}

function renderResources(course) {
  const el = $("courseResources");
  if (!el) return;
  const items = course.resources || [];
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

function renderFiles(course) {
  const el = $("courseFiles");
  if (!el) return;
  const files = course.files || [];
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

function boot() {
  const id = qs().get("id") || "";
  const course = getCourseById(id);
  if (!course) {
    renderNotFound();
    return;
  }

  renderContent(course);
  renderResources(course);
  renderFiles(course);

  // Default (logged out)
  renderHeader(course, { enrolled: false });
  renderMeta(course, { enrolled: false });
  renderCTA({ course, user: null, enrolled: false, onEnroll: () => {} });
  renderVideo({ course, user: null, enrolled: false });

  const fb = ensureFirebase();
  if (!fb) return;
  const { auth, db } = fb;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      renderHeader(course, { enrolled: false });
      renderMeta(course, { enrolled: false });
      renderCTA({ course, user: null, enrolled: false, onEnroll: () => {} });
      renderVideo({ course, user: null, enrolled: false });
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
      renderVideo({ course, user, enrolled });
    };

    await refresh();
  });
}

document.addEventListener("DOMContentLoaded", boot);

