import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const ADMIN_EMAILS = ["mentor0329@hanmail.net"];
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

function setWarn(text) {
  const warn = $("adminWarn");
  if (!warn) return;
  warn.classList.add("is-visible");
  warn.textContent = text;
}

function clearWarn() {
  const warn = $("adminWarn");
  if (!warn) return;
  warn.classList.remove("is-visible");
  warn.textContent = "";
}

function setStatus(el, text, tone = "info") {
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

function isAdminEmail(email) {
  const e = (email || "").toLowerCase();
  if (ADMIN_EMAILS.length === 0) return false;
  return ADMIN_EMAILS.map((x) => String(x).toLowerCase()).includes(e);
}

function getCheckedWeekdays() {
  const wrap = document.querySelector("#ruleForm .checks");
  const values = Array.from(wrap?.querySelectorAll('input[type="checkbox"]:checked') || []).map((x) =>
    Number(x.value),
  );
  return values.filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
}

function toTimestampFromDateTimeLocal(value) {
  // datetime-local returns "YYYY-MM-DDTHH:mm"
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function boot() {
  const fb = ensureFirebase();
  const gate = $("adminGate");
  const body = $("adminBody");
  const ruleMsg = $("ruleMsg");
  const eventMsg = $("eventMsg");

  if (!fb) {
    setWarn("Firebase 설정이 없습니다. `firebase-config.js`를 확인해줘.");
    gate.style.display = "block";
    body.style.display = "none";
    return;
  }

  onAuthStateChanged(fb.auth, async (user) => {
    if (!user) {
      setWarn("로그인이 필요합니다.");
      gate.style.display = "block";
      body.style.display = "none";
      return;
    }

    if (!isAdminEmail(user.email)) {
      setWarn("이 계정은 관리자 권한이 없습니다.");
      gate.style.display = "block";
      body.style.display = "none";
      return;
    }

    clearWarn();
    gate.style.display = "none";
    body.style.display = "block";
  });

  $("ruleForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus(ruleMsg, "저장 중...", "info");

    const title = String($("rTitle").value || "").trim();
    const type = String($("rType").value || "live");
    const weekdays = getCheckedWeekdays();
    const time = String($("rTime").value || "").trim();
    const durationMinutes = Number($("rDuration").value || 60);
    const startDate = String($("rStart").value || "").trim();
    const endDate = String($("rEnd").value || "").trim();
    const teacher = String($("rTeacher").value || "").trim();
    const place = String($("rPlace").value || "").trim();

    if (!title || !time || weekdays.length === 0) {
      setStatus(ruleMsg, "제목/요일/시간은 필수야.", "error");
      return;
    }

    try {
      await addDoc(collection(fb.db, "scheduleRules"), {
        title,
        type,
        weekdays,
        time,
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 60,
        startDate,
        endDate,
        teacher,
        place,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatus(ruleMsg, "저장 완료!", "success");
      e.target.reset();
    } catch (err) {
      console.error(err);
      setStatus(ruleMsg, `저장 실패: ${err?.message || "오류"}`, "error");
    }
  });

  $("eventForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus(eventMsg, "저장 중...", "info");

    const title = String($("eTitle").value || "").trim();
    const type = String($("eType").value || "special");
    const startAt = toTimestampFromDateTimeLocal(String($("eStart").value || ""));
    const endAtRaw = String($("eEnd").value || "");
    const endAt = endAtRaw ? toTimestampFromDateTimeLocal(endAtRaw) : null;
    const teacher = String($("eTeacher").value || "").trim();
    const place = String($("ePlace").value || "").trim();

    if (!title || !startAt) {
      setStatus(eventMsg, "제목/시작은 필수야.", "error");
      return;
    }

    try {
      await addDoc(collection(fb.db, "scheduleEvents"), {
        title,
        type,
        startAt,
        endAt: endAt || startAt,
        teacher,
        place,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatus(eventMsg, "저장 완료!", "success");
      e.target.reset();
    } catch (err) {
      console.error(err);
      setStatus(eventMsg, `저장 실패: ${err?.message || "오류"}`, "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);

