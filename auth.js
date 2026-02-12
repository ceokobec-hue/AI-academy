import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  doc,
  getDoc,
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

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} 요청이 지연되고 있습니다. (timeout ${ms}ms)`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function ensureFirebase() {
  if (!isConfigReady(firebaseConfig)) {
    throw new Error(
      "Firebase 설정이 비어있습니다. firebase-config.js에 값을 먼저 채워주세요.",
    );
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
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
    setStatus(msgEl, "1/2 계정 생성 중...", "info");

    const cred = await withTimeout(
      createUserWithEmailAndPassword(auth, email, password),
      15000,
      "계정 생성",
    );
    const uid = cred.user.uid;

    // 헤더에서 이메일 대신 별명 표시를 위해 Auth 프로필에도 저장
    try {
      await withTimeout(updateProfile(cred.user, { displayName: nickname }), 15000, "프로필 저장");
    } catch (e) {
      // Firestore 저장은 계속 진행 (displayName 저장 실패는 치명적이지 않음)
      console.warn("Failed to set displayName.", e);
    }

    setStatus(msgEl, "2/2 설문 저장 중...", "info");
    await withTimeout(
      setDoc(doc(db, "users", uid), {
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
      }),
      15000,
      "설문 저장",
    );

    setStatus(msgEl, "회원가입 완료! 로그인 페이지로 이동합니다.", "success");
    window.setTimeout(() => {
      window.location.href = "./login.html";
    }, 900);
  } catch (err) {
    console.error(err);
    const msg = err?.message || String(err) || "알 수 없는 오류";
    setStatus(
      msgEl,
      `회원가입 처리 중 문제가 발생했습니다: ${msg}\n(브라우저 개발자도구 Console/Network 탭의 에러를 함께 확인해 주세요)`,
      "error",
    );
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
    const { auth, db } = await ensureFirebase();
    setStatus(msgEl, "1/2 로그인 중...", "info");
    const cred = await withTimeout(
      signInWithEmailAndPassword(auth, email, password),
      15000,
      "로그인",
    );

    // 로그인만으로도 Firestore에 기록이 남도록 보장 (없으면 생성, 있으면 lastLoginAt 업데이트)
    setStatus(msgEl, "2/2 사용자 정보 확인 중...", "info");
    const uid = cred.user.uid;
    const userRef = doc(db, "users", uid);

    const snap = await withTimeout(getDoc(userRef), 15000, "사용자 정보 조회");
    const baseDoc = {
      profile: {
        email: cred.user.email || email,
      },
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await withTimeout(
        setDoc(
          userRef,
          {
            ...baseDoc,
            createdAt: serverTimestamp(),
            profile: {
              name: "",
              nickname: "",
              email: cred.user.email || email,
            },
            survey: {
              industry: "",
              role: "",
              companySize: "",
              aiGoals: [],
              priority: "",
              aiLevel: "",
              weeklyTime: "",
              painPoints: [],
              note: "",
            },
            consent: {
              agreeTerms: false,
              agreePrivacy: false,
              agreeMarketing: false,
            },
            profileIncomplete: true,
          },
          { merge: true },
        ),
        15000,
        "사용자 정보 생성",
      );
    } else {
      await withTimeout(setDoc(userRef, baseDoc, { merge: true }), 15000, "로그인 기록 저장");
    }

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

