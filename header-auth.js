import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

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

function findAuthLinks() {
  const loginLink = document.querySelector('[data-auth-link="login"]');
  const signupLink = document.querySelector('[data-auth-link="signup"]');
  return { loginLink, signupLink };
}

function ensureAuthUIContainer({ signupLink, loginLink }) {
  const existing = document.querySelector("[data-auth-ui]");
  if (existing) return existing;

  const container = document.createElement("span");
  container.className = "nav-auth";
  container.dataset.authUi = "true";

  // Prefer placing where login/signup live
  const anchor = signupLink || loginLink;
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(container, anchor.nextSibling);
  } else {
    document.querySelector("nav.nav")?.appendChild(container);
  }
  return container;
}

function isMobileNav() {
  try {
    return (
      window.matchMedia?.("(max-width: 840px)")?.matches ||
      window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches
    );
  } catch {
    return false;
  }
}

function resetMobileNavScroll() {
  if (!isMobileNav()) return;
  const nav = document.querySelector("nav.nav");
  if (!nav) return;
  // iOS/Safari can restore horizontal scroll position; force start at the first item.
  const go = () => {
    nav.scrollLeft = 0;
    try {
      nav.scrollTo?.({ left: 0, behavior: "auto" });
    } catch {
      // ignore
    }
  };

  go();
  requestAnimationFrame(go);
  window.setTimeout(go, 0);
  window.setTimeout(go, 60);
  window.setTimeout(go, 200);
}

function wireMobileNavDrawer() {
  const nav = document.querySelector("nav.nav");
  const headerInner = document.querySelector(".header-inner");
  if (!nav || !headerInner) return;

  // Ensure stable id for aria-controls
  if (!nav.id) nav.id = "siteNav";

  // Backdrop (mobile only via CSS)
  let backdrop = document.querySelector(".nav-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);
  }

  // Toggle button (mobile only via CSS)
  let toggle = document.querySelector("[data-nav-toggle]");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-toggle";
    toggle.dataset.navToggle = "true";
    toggle.setAttribute("aria-label", "메뉴 열기");
    toggle.setAttribute("aria-controls", nav.id);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `
      <span class="nav-toggle-lines" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    `;
    headerInner.appendChild(toggle);
  }

  const root = document.documentElement;
  const isOpen = () => root.classList.contains("nav-open");
  const open = () => {
    root.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "메뉴 닫기");
  };
  const close = () => {
    root.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "메뉴 열기");
  };
  const toggleOpen = () => (isOpen() ? close() : open());

  toggle.addEventListener("click", toggleOpen);
  backdrop.addEventListener("click", close);
  nav.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a");
    if (!a) return;
    // Chrome can cancel navigation if we transform/close synchronously.
    // Defer closing to next tick so the default navigation can proceed first.
    window.setTimeout(close, 0);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // If leaving mobile viewport, ensure drawer is closed
  try {
    const mq = window.matchMedia("(max-width: 840px)");
    mq.addEventListener?.("change", (ev) => {
      if (!ev.matches) close();
    });
  } catch {
    // ignore
  }
}

function isAdmin(user) {
  return typeof user?.email === "string" && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function upsertAdminLink(user) {
  const nav = document.querySelector("nav.nav");
  if (!nav) return;

  const existing = nav.querySelector('[data-admin-link="true"]');
  if (user && isAdmin(user)) {
    if (existing) return;
    const a = document.createElement("a");
    a.className = "nav-link";
    a.href = "./admin.html";
    a.textContent = "관리자";
    a.dataset.adminLink = "true";

    const loginLink = nav.querySelector('[data-auth-link="login"]');
    nav.insertBefore(a, loginLink || null);
    resetMobileNavScroll();
    return;
  }

  existing?.remove();
  resetMobileNavScroll();
}

function renderLoggedOut({ loginLink, signupLink, authUI }) {
  if (loginLink) loginLink.style.display = "";
  if (signupLink) signupLink.style.display = "";
  if (authUI) authUI.textContent = "";
  resetMobileNavScroll();
}

function renderLoggedIn({ loginLink, signupLink, authUI, displayName, onLogout }) {
  if (loginLink) loginLink.style.display = "none";
  if (signupLink) signupLink.style.display = "none";
  if (!authUI) return;

  authUI.innerHTML = "";

  const inviteLink = document.createElement("a");
  inviteLink.className = "nav-link";
  inviteLink.href = "./invite.html";
  inviteLink.textContent = "초대코드";

  const nameEl = document.createElement("span");
  nameEl.className = "nav-user";
  nameEl.textContent = `${displayName}님`;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-logout";
  btn.textContent = "로그아웃";
  btn.addEventListener("click", onLogout);

  authUI.append(inviteLink, nameEl, btn);
  resetMobileNavScroll();
}

async function getDisplayName({ user, db }) {
  // Preference: nickname > name > email
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data() || {};
      const profile = data.profile || {};
      const nickname = typeof profile.nickname === "string" ? profile.nickname.trim() : "";
      const name = typeof profile.name === "string" ? profile.name.trim() : "";
      if (nickname) return nickname;
      if (name) return name;
    }
  } catch (e) {
    // ignore (rules/network/etc) and fall back
    console.warn("Failed to fetch profile for header display.", e);
  }

  return user.displayName || user.email || "내 계정";
}

function wireHeaderAuth() {
  wireMobileNavDrawer();

  // Ensure mobile nav starts from the first menu on initial load / bfcache restore.
  resetMobileNavScroll();
  window.addEventListener("pageshow", resetMobileNavScroll);
  window.addEventListener("load", resetMobileNavScroll);

  const fb = ensureFirebase();
  if (!fb) return;

  const { auth, db } = fb;
  const { loginLink, signupLink } = findAuthLinks();
  const authUI = ensureAuthUIContainer({ signupLink, loginLink });

  onAuthStateChanged(auth, async (user) => {
    // 익명 로그인(예: 실시간 게시판)은 "로그인 상태"로 UI를 바꾸지 않음
    if (!user || user.isAnonymous) {
      upsertAdminLink(null);
      renderLoggedOut({ loginLink, signupLink, authUI });
      return;
    }

    upsertAdminLink(user);
    const displayName = await getDisplayName({ user, db });
    renderLoggedIn({
      loginLink,
      signupLink,
      authUI,
      displayName,
      onLogout: async () => {
        try {
          await signOut(auth);
        } finally {
          window.location.href = "./index.html";
        }
      },
    });
  });
}

document.addEventListener("DOMContentLoaded", wireHeaderAuth);

