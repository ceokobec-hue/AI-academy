import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

import { firebaseConfig } from "./firebase-config.js";

const ADMIN_EMAILS = ["mentor0329@hanmail.net"];
const CONFIG_PLACEHOLDER = "YOUR_";

function isConfigReady(cfg) {
  if (!cfg) return false;
  const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket"];
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
  const storage = getStorage(app);
  return { auth, db, storage };
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

async function loadCurrentMission(db) {
  const snap = await getDoc(doc(db, "missions", "current"));
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  return {
    title: d.title || "",
    description: d.description || "",
    example: d.example || "",
    thumbnailUrl: d.thumbnailUrl || "",
  };
}

function uploadImage({ storage, path, file, progressEl }) {
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file);
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
        if (progressEl) progressEl.value = pct;
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      },
    );
  });
}

function extFromName(name) {
  const idx = String(name || "").lastIndexOf(".");
  if (idx === -1) return ".png";
  return String(name || "").slice(idx).toLowerCase();
}

async function boot() {
  const fb = ensureFirebase();
  const gate = $("adminGate");
  const form = $("adminMissionForm");
  const msgEl = $("adminMsg");
  const thumbInput = $("mThumb");
  const thumbProgress = $("mThumbProgress");
  const thumbPreview = $("mThumbPreview");
  const thumbPreviewImg = $("mThumbPreviewImg");
  let currentThumbUrl = "";

  if (!fb) {
    setWarn("Firebase 설정이 없거나 storageBucket이 비어있습니다. `firebase-config.js`를 확인해줘.");
    gate.style.display = "block";
    form.style.display = "none";
    return;
  }

  const { auth, db, storage } = fb;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setWarn("로그인이 필요합니다.");
      gate.style.display = "block";
      form.style.display = "none";
      return;
    }

    if (!isAdminEmail(user.email)) {
      setWarn("이 계정은 관리자 권한이 없습니다.");
      gate.style.display = "block";
      form.style.display = "none";
      return;
    }

    clearWarn();
    gate.style.display = "none";
    form.style.display = "block";

    // 기존 데이터 불러오기
    try {
      const m = await loadCurrentMission(db);
      if (m) {
        $("mTitle").value = m.title || "";
        $("mDesc").value = m.description || "";
        $("mExample").value = m.example || "";
        currentThumbUrl = m.thumbnailUrl || "";
        if (currentThumbUrl && thumbPreview && thumbPreviewImg) {
          thumbPreviewImg.src = currentThumbUrl;
          thumbPreview.style.display = "block";
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  thumbInput?.addEventListener("change", () => {
    const file = thumbInput.files?.[0] || null;
    if (!file || !thumbPreview || !thumbPreviewImg) return;
    const url = URL.createObjectURL(file);
    thumbPreviewImg.src = url;
    thumbPreview.style.display = "block";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus(msgEl, "저장 중...", "info");

    const title = String($("mTitle").value || "").trim();
    const description = String($("mDesc").value || "").trim();
    const example = String($("mExample").value || "");
    const file = thumbInput?.files?.[0] || null;

    if (!title || !description) {
      setStatus(msgEl, "제목/설명을 입력해줘.", "error");
      return;
    }

    try {
      let thumbnailUrl = currentThumbUrl || "";
      if (file) {
        if (thumbProgress) thumbProgress.value = 0;
        const ext = extFromName(file.name);
        const url = await uploadImage({
          storage,
          path: `community/missions/current/thumbnail${ext}`,
          file,
          progressEl: thumbProgress,
        });
        thumbnailUrl = url;
      }

      await setDoc(
        doc(fb.db, "missions", "current"),
        {
          title,
          description,
          example,
          thumbnailUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setStatus(msgEl, "저장 완료! 커뮤니티에 바로 반영돼.", "success");
    } catch (err) {
      console.error(err);
      setStatus(msgEl, `저장 실패: ${err?.message || "오류"}`, "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);

