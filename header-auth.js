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
    return;
  }

  existing?.remove();
}

function renderLoggedOut({ loginLink, signupLink, authUI }) {
  if (loginLink) loginLink.style.display = "";
  if (signupLink) signupLink.style.display = "";
  if (authUI) authUI.textContent = "";
}

function renderLoggedIn({ loginLink, signupLink, authUI, displayName, onLogout }) {
  if (loginLink) loginLink.style.display = "none";
  if (signupLink) signupLink.style.display = "none";
  if (!authUI) return;

  authUI.innerHTML = "";

  const nameEl = document.createElement("span");
  nameEl.className = "nav-user";
  nameEl.textContent = `${displayName}님`;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-logout";
  btn.textContent = "로그아웃";
  btn.addEventListener("click", onLogout);

  authUI.append(nameEl, btn);
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

