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
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { COURSES, DEFAULT_CATEGORIES, formatKrw } from "./courses-data.js";

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

function pickFeatured(courses, flagKey, excludeId = "") {
  const list = courses.filter((c) => !!c?.[flagKey] && c.id !== excludeId);
  if (!list.length) return null;
  return list
    .slice()
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
}

function courseCard(course, { enrolled, inviteUnlocked, isAdmin }) {
  const priceOrBadge = enrolled
    ? inviteUnlocked
      ? `<span class="badge badge-success">무료 오픈</span>`
      : `<span class="badge badge-success">수강 중</span>`
    : `<span class="badge badge-primary">${formatKrw(course.priceKrw)}</span>`;

  const thumb = course.thumbnailUrl
    ? `<img src="${esc(course.thumbnailUrl)}" alt="" loading="lazy" decoding="async" />`
    : `<span class="muted">No Image</span>`;

  return `
    <article class="course-card">
      <div class="course-thumb" aria-hidden="true">${thumb}</div>
      <div class="course-body">
        <h3 class="course-title">${esc(course.title)}</h3>
        <p class="course-desc">${esc(course.shortDescription)}</p>
        <div class="course-meta-row">
          ${priceOrBadge}
          <span class="badge badge-neutral">수강기간 ${course.durationDays}일</span>
        </div>
        <div class="course-actions">
          <a class="btn btn-primary btn-sm" href="./lesson.html?id=${encodeURIComponent(course.id)}"
            >강의 보기</a
          >
          ${
            isAdmin
              ? `<a class="btn btn-ghost btn-sm" href="./admin.html?id=${encodeURIComponent(
                  course.id,
                )}">수정</a>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function featuredCard(course, label, { enrolled, inviteUnlocked, isAdmin }) {
  const badge = label === "신규 강의" ? "badge-primary" : "badge-success";
  const status = enrolled
    ? inviteUnlocked
      ? `<span class="badge badge-success">무료 오픈</span>`
      : `<span class="badge badge-success">수강 중</span>`
    : "";
  return `
    <div class="featured-card">
      <div class="featured-badge-row">
        <span class="badge ${badge}">${label}</span>
        ${status}
      </div>
      ${courseCard(course, { enrolled, inviteUnlocked, isAdmin })}
    </div>
  `;
}

async function getEnrollmentMap({ uid, db, courses }) {
  const pairs = await Promise.all(
    courses.map(async (c) => {
      const ref = doc(db, "users", uid, "enrollments", c.id);
      const snap = await getDoc(ref);
      return [c.id, snap.exists()];
    }),
  );
  return Object.fromEntries(pairs);
}

async function getInviteVerified({ uid, db }) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return false;
    const ent = snap.data()?.entitlements || {};
    return ent.inviteVerified === true;
  } catch (e) {
    console.warn("Failed to fetch entitlements.", e);
    return false;
  }
}

async function fetchCategories(db) {
  try {
    const q = query(collection(db, "categories"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => typeof c.name === "string" && c.name.trim());
    if (!list.length) return null;
    return list.map((c, idx) => ({
      id: String(c.id),
      name: String(c.name),
      order: typeof c.order === "number" ? c.order : idx + 1,
    }));
  } catch (e) {
    console.warn("Failed to fetch categories from Firestore, falling back.", e);
    return null;
  }
}

function groupCoursesByCategory(categories) {
  const map = new Map(categories.map((c) => [c.id, []]));
  for (const course of COURSES) {
    const id = course.categoryId || "";
    if (!map.has(id)) continue;
    map.get(id).push(course);
  }
  return map;
}

async function fetchCourses(db) {
  try {
    const snap = await getDocs(collection(db, "courses"));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const published = list.filter((c) => c && c.published !== false && typeof c.title === "string");
    return published;
  } catch (e) {
    console.warn("Failed to fetch courses from Firestore, falling back.", e);
    return null;
  }
}

function normalizeCourses(list) {
  const raw = Array.isArray(list) && list.length ? list : COURSES;
  return raw.map((c) => ({
    id: String(c.id),
    categoryId: String(c.categoryId || ""),
    isNew: !!c.isNew,
    isPopular: !!c.isPopular,
    inviteFreeOpen: !!c.inviteFreeOpen,
    title: String(c.title || ""),
    shortDescription: String(c.shortDescription || ""),
    priceKrw: Number(c.priceKrw || 0),
    durationDays: Number(c.durationDays || 0),
    startDate: String(c.startDate || ""),
    thumbnailUrl: String(c.thumbnailUrl || ""),
    video: c.video || { src: "", poster: "" },
    content: c.content || { overview: "", bullets: [] },
    resources: Array.isArray(c.resources) ? c.resources : [],
    files: Array.isArray(c.files) ? c.files : [],
  }));
}

function renderCategoryNav(categories) {
  const buttons = [
    `<button type="button" class="category-chip is-active" data-target="top">전체</button>`,
    ...categories
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(
        (c) =>
          `<button type="button" class="category-chip" data-target="${esc(c.id)}">${esc(
            c.name,
          )}</button>`,
      ),
  ].join("");

  return `
    <nav class="category-nav" aria-label="카테고리 바로가기">
      <div class="category-chips">
        ${buttons}
      </div>
    </nav>
  `;
}

function wireCategoryNav() {
  const nav = document.getElementById("categoryNav");
  if (!nav) return;
  if (nav.dataset.wired === "true") return;
  nav.dataset.wired = "true";

  nav.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-target]");
    if (!btn) return;

    const target = btn.getAttribute("data-target") || "";
    nav.querySelectorAll(".category-chip").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    if (target === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderCatalog({ categories, enrollmentMap, courses, isAdmin }) {
  const featuredNew = pickFeatured(courses, "isNew");
  const featuredPopular = pickFeatured(courses, "isPopular", featuredNew?.id || "");

  const featuredEl = $("featured");
  const categoriesEl = $("categories");

  if (featuredEl) {
    const adminLink = isAdmin
      ? `<span class="muted">관리자 업로드:</span> <a class="link" href="./admin.html">admin.html</a>`
      : "";
    featuredEl.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">강의 카탈로그</h1>
        <p class="page-sub">
          신규/인기 강의와 카테고리별 강의를 확인하세요.
          ${adminLink}
        </p>
      </div>
      <div id="categoryNav">
        ${renderCategoryNav(categories)}
      </div>
      <div class="featured-grid">
        ${
          featuredNew
            ? featuredCard(featuredNew, "신규 강의", {
                enrolled: !!enrollmentMap?.[featuredNew.id],
                inviteUnlocked: !!featuredNew.inviteUnlocked,
                isAdmin,
              })
            : ""
        }
        ${
          featuredPopular
            ? featuredCard(featuredPopular, "인기 강의", {
                enrolled: !!enrollmentMap?.[featuredPopular.id],
                inviteUnlocked: !!featuredPopular.inviteUnlocked,
                isAdmin,
              })
            : ""
        }
      </div>
    `;
    wireCategoryNav();
  }

  if (categoriesEl) {
    const grouped = new Map(categories.map((c) => [c.id, []]));
    for (const course of courses) {
      const id = course.categoryId || "";
      if (!grouped.has(id)) continue;
      grouped.get(id).push(course);
    }
    categoriesEl.innerHTML = categories
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((cat) => {
        const courses = grouped.get(cat.id) || [];
        return `
          <section class="category-section" id="${esc(cat.id)}">
            <h2 class="category-title">${esc(cat.name)}</h2>
            ${
              courses.length
                ? `<div class="course-grid">${courses
                    .map((c) =>
                      courseCard(c, {
                        enrolled: !!enrollmentMap?.[c.id],
                        inviteUnlocked: !!c.inviteUnlocked,
                        isAdmin,
                      }),
                    )
                    .join("")}</div>`
                : `<p class="muted" style="margin:0;">아직 강의가 없습니다.</p>`
            }
          </section>
        `;
      })
      .join("");
  }
}

function boot() {
  // Backward compatibility: old deep link course.html?id=... -> lesson.html?id=...
  const url = new URL(window.location.href);
  const id = url.searchParams.get("id");
  if (id) {
    window.location.replace(`./lesson.html?id=${encodeURIComponent(id)}`);
    return;
  }

  const fb = ensureFirebase();
  if (!fb) {
    renderCatalog({
      categories: DEFAULT_CATEGORIES,
      enrollmentMap: {},
      courses: normalizeCourses(null),
      isAdmin: false,
    });
    return;
  }
  const { auth, db } = fb;

  // Render once with fallback categories first
  renderCatalog({
    categories: DEFAULT_CATEGORIES,
    enrollmentMap: {},
    courses: normalizeCourses(null),
    isAdmin: false,
  });

  onAuthStateChanged(auth, async (user) => {
    const categories = (await fetchCategories(db)) || DEFAULT_CATEGORIES;
    const courses = normalizeCourses(await fetchCourses(db));
    if (!user) {
      renderCatalog({ categories, enrollmentMap: {}, courses, isAdmin: false });
      return;
    }

    let enrollmentMap = {};
    try {
      enrollmentMap = await getEnrollmentMap({ uid: user.uid, db, courses });
    } catch (e) {
      console.warn("Failed to fetch enrollments.", e);
      enrollmentMap = {};
    }

    const inviteVerified = await getInviteVerified({ uid: user.uid, db });
    const coursesUi = courses.map((c) => {
      const enrolledDoc = !!enrollmentMap?.[c.id];
      const inviteUnlocked = !enrolledDoc && inviteVerified && !!c.inviteFreeOpen;
      return { ...c, inviteUnlocked };
    });
    const accessMap = Object.fromEntries(
      coursesUi.map((c) => [c.id, !!enrollmentMap?.[c.id] || !!c.inviteUnlocked]),
    );
    const isAdmin =
      typeof user.email === "string" && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    renderCatalog({ categories, enrollmentMap: accessMap, courses: coursesUi, isAdmin });
  });
}

document.addEventListener("DOMContentLoaded", boot);

