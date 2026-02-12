import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const CONFIG_PLACEHOLDER = "YOUR_";

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

function validatePassword(pw) {
  // 요구사항: 8자 이상, 대문자 포함
  return typeof pw === "string" && pw.length >= 8 && /[A-Z]/.test(pw);
}

function collectCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(
    (el) => el.value,
  );
}

async function ensureFirebase() {
  if (!isConfigReady(firebaseConfig)) {
    throw new Error(
      "Firebase 설정이 비어있습니다. firebase-config.js에 값을 먼저 채워주세요.",
    );
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return { auth, db };
}

async function handleSignupSubmit(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const msgEl = $("#signupMsg");
  setStatus(msgEl, "");

  const fd = new FormData(form);

  const name = String(fd.get("name") || "").trim();
  const nickname = String(fd.get("nickname") || "").trim();
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const passwordConfirm = String(fd.get("passwordConfirm") || "");

  if (!name || !nickname || !email || !password || !passwordConfirm) {
    setStatus(msgEl, "필수 항목을 모두 입력해 주세요.", "error");
    return;
  }
  if (password !== passwordConfirm) {
    setStatus(msgEl, "비밀번호가 서로 일치하지 않습니다.", "error");
    return;
  }
  if (!validatePassword(password)) {
    setStatus(msgEl, "비밀번호는 8자 이상, 대문자 1자 이상 포함해야 합니다.", "error");
    return;
  }
  if (!fd.get("agreeTerms") || !fd.get("agreePrivacy")) {
    setStatus(msgEl, "이용약관/개인정보 처리방침에 동의해야 가입이 가능합니다.", "error");
    return;
  }

  // 설문(2번)
  const industry = String(fd.get("industry") || "");
  const role = String(fd.get("role") || "").trim();
  const companySize = String(fd.get("companySize") || "");
  const aiGoals = collectCheckedValues("aiGoals");
  const priority = String(fd.get("priority") || "");
  const aiLevel = String(fd.get("aiLevel") || "");
  const weeklyTime = String(fd.get("weeklyTime") || "");
  const painPoints = collectCheckedValues("painPoints");
  const note = String(fd.get("note") || "").trim();

  const agreeMarketing = !!fd.get("agreeMarketing");

  try {
    const { auth, db } = await ensureFirebase();
    setStatus(msgEl, "계정 생성 중...", "info");

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    await setDoc(doc(db, "users", uid), {
      profile: {
        name,
        nickname,
        email,
      },
      survey: {
        industry,
        role,
        companySize,
        aiGoals,
        priority,
        aiLevel,
        weeklyTime,
        painPoints,
        note,
      },
      consent: {
        agreeTerms: true,
        agreePrivacy: true,
        agreeMarketing,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setStatus(msgEl, "회원가입 완료! 로그인 페이지로 이동합니다.", "success");
    window.setTimeout(() => {
      window.location.href = "./login.html";
    }, 900);
  } catch (err) {
    console.error(err);
    setStatus(msgEl, `회원가입 실패: ${err?.message || "알 수 없는 오류"}`, "error");
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const msgEl = $("#loginMsg");
  setStatus(msgEl, "");

  const fd = new FormData(form);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");

  if (!email || !password) {
    setStatus(msgEl, "이메일/비밀번호를 입력해 주세요.", "error");
    return;
  }

  try {
    const { auth } = await ensureFirebase();
    setStatus(msgEl, "로그인 중...", "info");
    await signInWithEmailAndPassword(auth, email, password);
    setStatus(msgEl, "로그인 성공! 메인으로 이동합니다.", "success");
    window.setTimeout(() => {
      window.location.href = "./index.html";
    }, 650);
  } catch (err) {
    console.error(err);
    setStatus(msgEl, `로그인 실패: ${err?.message || "알 수 없는 오류"}`, "error");
  }
}

async function handlePasswordReset() {
  const modal = $("#resetModal");
  const input = $("#resetEmail");
  const msgEl = $("#resetMsg");

  if (!modal || !input || !msgEl) {
    // fallback
    const email = window.prompt("비밀번호 재설정 이메일을 입력해 주세요.");
    if (!email) return;
    try {
      const { auth } = await ensureFirebase();
      await sendPasswordResetEmail(auth, email);
      window.alert("재설정 이메일을 보냈습니다. 스팸함도 확인해 주세요.");
    } catch (err) {
      window.alert(err?.message || "오류가 발생했습니다.");
    }
    return;
  }

  setStatus(msgEl, "");
  input.value = "";
  modal.showModal();
  input.focus();
}

async function handleResetSubmit(e) {
  e.preventDefault();
  const input = $("#resetEmail");
  const msgEl = $("#resetMsg");
  if (!input || !msgEl) return;

  const email = String(input.value || "").trim();
  if (!email) {
    setStatus(msgEl, "이메일을 입력해 주세요.", "error");
    return;
  }

  try {
    const { auth } = await ensureFirebase();
    setStatus(msgEl, "이메일 전송 중...", "info");
    await sendPasswordResetEmail(auth, email);
    setStatus(msgEl, "재설정 이메일을 보냈습니다. 스팸함도 확인해 주세요.", "success");
  } catch (err) {
    console.error(err);
    setStatus(msgEl, `전송 실패: ${err?.message || "알 수 없는 오류"}`, "error");
  }
}

function wire() {
  const signupForm = $("#signupForm");
  const loginForm = $("#loginForm");

  signupForm?.addEventListener("submit", handleSignupSubmit);
  loginForm?.addEventListener("submit", handleLoginSubmit);

  $("#btnReset")?.addEventListener("click", handlePasswordReset);
  $("#resetForm")?.addEventListener("submit", handleResetSubmit);
  $("#resetClose")?.addEventListener("click", () => $("#resetModal")?.close());

  // config 안내
  const warnEls = document.querySelectorAll("[data-firebase-warning]");
  if (!isConfigReady(firebaseConfig)) {
    warnEls.forEach((el) => {
      el.textContent =
        "Firebase 설정이 아직 비어있습니다. `firebase-config.js`를 먼저 채워주세요.";
      el.classList.add("is-visible");
    });
  }
}

document.addEventListener("DOMContentLoaded", wire);

