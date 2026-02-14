import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-functions.js";

import { firebaseConfig } from "./firebase-config.js";

const CONFIG_PLACEHOLDER = "YOUR_";
const REGION = "asia-northeast3";

function isConfigReady(cfg) {
  if (!cfg) return false;
  const requiredKeys = ["apiKey", "authDomain", "projectId"];
  return requiredKeys.every((k) => {
    const v = cfg[k];
    return typeof v === "string" && v.length > 0 && !v.includes(CONFIG_PLACEHOLDER);
  });
}

function $(sel) {
  return document.querySelector(sel);
}

function setStatus(el, text, tone = "info") {
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

function toast(msg) {
  const stack = document.querySelector(".toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

function normalizeCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function ensureFirebase() {
  if (!isConfigReady(firebaseConfig)) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const functions = getFunctions(app, REGION);
  return { auth, functions };
}

async function boot() {
  const fb = ensureFirebase();
  const gate = $("#inviteGate");
  const form = $("#inviteForm");
  const msgEl = $("#inviteMsg");
  const codeEl = /** @type {HTMLInputElement|null} */ ($("#inviteCode"));

  if (!fb) {
    setStatus(gate, "Firebase 설정이 비어 있습니다. firebase-config.js를 확인해 주세요.", "error");
    gate?.classList.add("is-visible");
    form?.setAttribute("hidden", "true");
    return;
  }

  const { auth, functions } = fb;
  const redeemInviteCode = httpsCallable(functions, "redeemInviteCode");

  onAuthStateChanged(auth, (user) => {
    gate?.classList.remove("is-visible");
    setStatus(gate, "");

    if (!user || user.isAnonymous) {
      gate?.classList.add("is-visible");
      setStatus(gate, "초대코드 등록은 로그인 후 가능합니다. 로그인/회원가입을 먼저 해주세요.", "error");
      return;
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus(msgEl, "");

    const code = normalizeCode(codeEl?.value || "");
    if (!code) {
      setStatus(msgEl, "초대코드를 입력해 주세요.", "error");
      return;
    }

    try {
      setStatus(msgEl, "확인 중...", "info");
      const res = await redeemInviteCode({ code });
      const data = res?.data || {};
      if (data?.alreadyVerified) {
        setStatus(msgEl, "이미 초대코드 등록이 완료된 계정입니다.", "success");
        toast("이미 등록된 계정입니다.");
        return;
      }
      setStatus(msgEl, "등록 완료! 무료로 열리는 강의를 확인해 보세요.", "success");
      toast("초대코드 등록 완료");
    } catch (err) {
      console.error(err);
      const msg = err?.message || "등록 실패(권한/네트워크)";
      setStatus(msgEl, msg, "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);

