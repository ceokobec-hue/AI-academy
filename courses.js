import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { COURSES, formatKrw } from "./courses-data.js";

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

function $(id) {
  return document.getElementById(id);
}

function courseCard(course, { enrolled }) {
  const priceOrBadge = enrolled
    ? `<span class="badge badge-success">수강 중</span>`
    : `<span class="badge badge-primary">${formatKrw(course.priceKrw)}</span>`;

  const thumb = course.thumbnailUrl
    ? `<img src="${course.thumbnailUrl}" alt="" loading="lazy" decoding="async" />`
    : `<span class="muted">No Image</span>`;

  return `
    <article class="course-card" data-course-id="${course.id}">
      <div class="course-thumb" aria-hidden="true">
        ${thumb}
      </div>
      <div class="course-body">
        <h2 class="course-title">${course.title}</h2>
        <p class="course-desc">${course.shortDescription}</p>
        <div class="course-meta-row">
          ${priceOrBadge}
          <span>수강기간: ${course.durationDays}일</span>
          <span>개강일: ${course.startDate}</span>
        </div>
        <div class="course-actions">
          <a class="btn btn-primary btn-sm" href="./course.html?id=${encodeURIComponent(
            course.id,
          )}">자세히 보기</a>
          ${
            enrolled
              ? `<a class="btn btn-ghost btn-sm" href="./course.html?id=${encodeURIComponent(
                  course.id,
                )}">수강하기</a>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

async function getEnrollmentMap({ uid, db }) {
  // courseId -> boolean
  const pairs = await Promise.all(
    COURSES.map(async (c) => {
      const ref = doc(db, "users", uid, "enrollments", c.id);
      const snap = await getDoc(ref);
      return [c.id, snap.exists()];
    }),
  );
  return Object.fromEntries(pairs);
}

function renderCourses({ enrollmentMap }) {
  const grid = $("coursesGrid");
  if (!grid) return;

  grid.innerHTML = COURSES.map((c) => courseCard(c, { enrolled: !!enrollmentMap?.[c.id] })).join(
    "",
  );
}

function renderLoading() {
  const grid = $("coursesGrid");
  if (!grid) return;
  grid.innerHTML = `
    <div class="card" style="padding:18px;">
      강의 목록을 불러오는 중입니다...
    </div>
  `;
}

function renderError(message) {
  const grid = $("coursesGrid");
  if (!grid) return;
  grid.innerHTML = `
    <div class="card" style="padding:18px;">
      <p style="margin:0;font-weight:900;">불러오기 실패</p>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.74);line-height:1.6;">${message}</p>
    </div>
  `;
}

function boot() {
  renderLoading();

  // 기본은 로그아웃 상태(가격 표시)
  renderCourses({ enrollmentMap: {} });

  const fb = ensureFirebase();
  if (!fb) return;

  const { auth, db } = fb;
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      renderCourses({ enrollmentMap: {} });
      return;
    }
    try {
      const enrollmentMap = await getEnrollmentMap({ uid: user.uid, db });
      renderCourses({ enrollmentMap });
    } catch (e) {
      console.error(e);
      renderError("수강 상태를 불러오지 못했습니다. Firestore 규칙/권한을 확인해 주세요.");
      // fallback: show prices
      renderCourses({ enrollmentMap: {} });
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);

