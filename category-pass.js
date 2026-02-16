import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  collection,
  getDocs,
  getFirestore,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-functions.js";

import { firebaseConfig } from "./firebase-config.js";
import { formatKrw } from "./courses-data.js";

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
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

async function fetchCoursesByCategory(db, categoryId) {
  const q = query(
    collection(db, "courses"),
    where("categoryId", "==", categoryId),
    where("published", "==", true),
    orderBy("title", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function boot() {
  const fb = ensureFirebase();
  if (!fb) {
    $("categoryCourses").innerHTML = `<p class="muted" style="margin:0;">Firebase 설정이 필요합니다.</p>`;
    return;
  }
  const { auth, db, functions } = fb;

  const categoryId = qs().get("categoryId") || "";
  const fallbackCourseId = qs().get("courseId") || "";
  if (!categoryId) {
    $("categoryCourses").innerHTML = `<p class="muted" style="margin:0;">categoryId가 필요합니다.</p>`;
    return;
  }

  // 강의로 돌아가기 링크 보정
  const back = $("backToLesson");
  if (back && fallbackCourseId) back.href = `./lesson.html?id=${encodeURIComponent(fallbackCourseId)}`;

  let courses = [];
  try {
    courses = await fetchCoursesByCategory(db, categoryId);
  } catch (e) {
    console.error(e);
    $("categoryCourses").innerHTML = `<p class="muted" style="margin:0;">강의 목록을 불러오지 못했습니다.</p>`;
    return;
  }

  if (!courses.length) {
    $("categoryCourses").innerHTML = `<p class="muted" style="margin:0;">이 카테고리에 공개된 강의가 없습니다.</p>`;
  } else {
    $("categoryCourses").innerHTML = courses
      .map(
        (c) => `
          <div class="side-meta-item">
            <span style="font-weight:800;">${esc(c.title || c.id)}</span>
            <a class="btn btn-ghost btn-xs" href="./lesson.html?id=${encodeURIComponent(c.id)}">보기</a>
          </div>
        `,
      )
      .join("");
  }

  // 가격은 첫 강의의 pricing.category30/90를 기준(관리자 기본값 사용 전제)
  const base = courses[0] || null;
  const p = base?.pricing || {};
  const price30 = Number(p.category30 || 0);
  const price90 = Number(p.category90 || 0);

  $("categoryPricing").innerHTML = `
    <h4 class="pricing-title">카테고리(${esc(categoryId)})</h4>
    ${pricingRow("30일", price30)}
    ${pricingRow("90일", price90, { recommended: true, tag: "추천" })}
  `;

  const renderCTA = ({ user }) => {
    const el = $("categoryCTA");
    if (!el) return;

    if (!user) {
      el.innerHTML = `
        <a class="btn btn-primary" href="./login.html">로그인 후 결제</a>
        <a class="btn btn-ghost" href="./signup.html">회원가입</a>
      `;
      return;
    }

    el.innerHTML = `
      <div class="plan-buttons">
        ${price30 ? `<button class="btn btn-ghost btn-sm" type="button" data-plan="category30">카테고리 30일 · ${formatKrw(price30)}</button>` : ""}
        ${price90 ? `<button class="btn btn-primary btn-sm" type="button" data-plan="category90">카테고리 90일 · ${formatKrw(price90)}<span class="plan-rec-badge">추천</span></button>` : ""}
      </div>
    `;

    el.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.("button[data-plan]");
      if (!btn) return;
      const plan = btn.dataset.plan;
      const courseId = (courses[0]?.id || fallbackCourseId || "");
      if (!courseId) {
        alert("카테고리 대표 강의를 찾지 못했습니다.");
        return;
      }

      const allBtns = el.querySelectorAll("button[data-plan]");
      allBtns.forEach((b) => (b.disabled = true));
      btn.textContent = "결제 준비 중…";

      try {
        const createOrder = httpsCallable(functions, "createPayPalOrder");
        const result = await createOrder({ plan, courseId });
        const approveUrl = result.data?.approveUrl;
        if (approveUrl) {
          window.location.href = approveUrl;
        } else {
          throw new Error("결제 URL을 받지 못했습니다.");
        }
      } catch (err) {
        console.error(err);
        alert(`결제 세션 생성에 실패했습니다.\n${err.message || err}`);
        allBtns.forEach((b) => (b.disabled = false));
      }
    });
  };

  onAuthStateChanged(auth, (user) => {
    renderCTA({ user });
  });
}

document.addEventListener("DOMContentLoaded", boot);

