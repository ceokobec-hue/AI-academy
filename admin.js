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
import { DEFAULT_CATEGORIES } from "./courses-data.js";

// A안: 관리자 이메일 allowlist
// TODO: 여기에 관리자 이메일을 추가하세요. 예: ["you@example.com"]
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

function parseBullets(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function extFromName(name) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx).toLowerCase();
}

function uploadFile({ storage, path, file, onProgress }) {
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file);
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
        onProgress?.(pct);
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      },
    );
  });
}

async function fetchCategories(db) {
  try {
    const q = query(collection(db, "categories"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => typeof c.name === "string" && c.name.trim());
    if (!list.length) return DEFAULT_CATEGORIES;
    return list.map((c, idx) => ({
      id: String(c.id),
      name: String(c.name),
      order: typeof c.order === "number" ? c.order : idx + 1,
    }));
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

function fillCategorySelect(selectEl, categories) {
  selectEl.innerHTML = categories
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
}

function getCourseIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("id") || "";
}

async function loadCourseForEdit({ db, courseId }) {
  const snap = await getDoc(doc(db, "courses", courseId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
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

function renderAttachProgress(files) {
  const wrap = $("attachProgressList");
  if (!wrap) return;
  wrap.innerHTML = files
    .map(
      (f, idx) => `
        <div class="attach-item">
          <div style="font-weight:900;">${f.name}</div>
          <progress class="upload-progress" id="attachProgress_${idx}" max="100" value="0"></progress>
        </div>
      `,
    )
    .join("");
}

async function boot() {
  const fb = ensureFirebase();
  const gate = $("adminGate");
  const form = $("adminForm");
  const msgEl = $("adminMsg");
  const resultEl = $("adminResult");
  const categorySelect = $("categoryId");

  if (!fb) {
    setWarn("Firebase 설정이 없거나 storageBucket이 비어있습니다. firebase-config.js를 확인해 주세요.");
    gate.style.display = "block";
    form.style.display = "none";
    return;
  }

  const { auth, db, storage } = fb;
  const categories = await fetchCategories(db);
  fillCategorySelect(categorySelect, categories);

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

    // Bootstrap note
    if (ADMIN_EMAILS.length === 0) {
      setWarn(
        "현재 `ADMIN_EMAILS`가 비어있어서 임시로 로그인한 계정을 관리자처럼 처리 중입니다. 운영 전에는 admin.js에서 관리자 이메일을 꼭 지정하세요.",
      );
    } else {
      clearWarn();
    }

    gate.style.display = "none";
    form.style.display = "block";

    // Edit mode
    const editId = getCourseIdFromUrl();
    if (editId) {
      try {
        const course = await loadCourseForEdit({ db, courseId: editId });
        if (course) {
          $("courseId").value = course.id || editId;
          $("title").value = course.title || "";
          $("shortDescription").value = course.shortDescription || "";
          $("priceKrw").value = course.priceKrw ?? "";
          $("durationDays").value = course.durationDays ?? "";
          $("startDate").value = course.startDate || "";
          $("categoryId").value = course.categoryId || categories[0]?.id || "";
          form.querySelector('input[name="isNew"]').checked = !!course.isNew;
          form.querySelector('input[name="isPopular"]').checked = !!course.isPopular;
          form.querySelector('input[name="published"]').checked = course.published !== false;
          form.querySelector('input[name="inviteFreeOpen"]').checked = !!course.inviteFreeOpen;
          $("overview").value = course.content?.overview || "";
          $("bullets").value = (course.content?.bullets || []).join("\n");
          const r0 = (course.resources || [])[0] || {};
          $("resourceTitle").value = r0.title || "";
          $("resourceDesc").value = r0.description || "";
          $("resourceCode").value = r0.code || "";
          resultEl.innerHTML = `<p class="hint" style="margin:0;">수정 모드: <b>${editId}</b></p>`;
        } else {
          resultEl.innerHTML = `<p class="hint" style="margin:0;">문서가 없어 새로 생성합니다: <b>${editId}</b></p>`;
          $("courseId").value = editId;
        }
      } catch (e) {
        console.error(e);
      }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus(msgEl, "", "info");
      resultEl.innerHTML = "";

      const fd = new FormData(form);
      const courseIdInput = String(fd.get("courseId") || "").trim();
      const title = String(fd.get("title") || "").trim();
      const shortDescription = String(fd.get("shortDescription") || "").trim();
      const priceKrw = Number(fd.get("priceKrw") || 0);
      const durationDays = Number(fd.get("durationDays") || 0);
      const startDate = String(fd.get("startDate") || "");
      const categoryId = String(fd.get("categoryId") || "").trim();
      const isNew = !!fd.get("isNew");
      const isPopular = !!fd.get("isPopular");
      const published = !!fd.get("published");
      const inviteFreeOpen = !!fd.get("inviteFreeOpen");

      if (!title || !shortDescription || !categoryId || !startDate || !durationDays) {
        setStatus(msgEl, "필수 항목(제목/설명/카테고리/개강일/기간)을 입력해 주세요.", "error");
        return;
      }

      // Generate courseId if blank
      const coursesCol = collection(db, "courses");
      const courseRef = courseIdInput ? doc(db, "courses", courseIdInput) : doc(coursesCol);
      const courseId = courseRef.id;

      const overview = String(fd.get("overview") || "").trim();
      const bullets = parseBullets(fd.get("bullets"));

      const resourceTitle = String(fd.get("resourceTitle") || "").trim();
      const resourceDesc = String(fd.get("resourceDesc") || "").trim();
      const resourceCode = String(fd.get("resourceCode") || "");
      const resources =
        resourceTitle || resourceDesc || resourceCode
          ? [{ title: resourceTitle, description: resourceDesc, code: resourceCode }]
          : [];

      const thumbFile = form.querySelector("#thumbFile")?.files?.[0] || null;
      const videoFile = form.querySelector("#videoFile")?.files?.[0] || null;
      const attachFiles = Array.from(form.querySelector("#attachFiles")?.files || []);

      // Prepare progress UI
      const thumbProgress = $("thumbProgress");
      const videoProgress = $("videoProgress");
      if (thumbProgress) thumbProgress.value = 0;
      if (videoProgress) videoProgress.value = 0;
      renderAttachProgress(attachFiles);

      setStatus(msgEl, "저장 준비 중...", "info");

      const now = Date.now();
      let thumbnailUrl = "";
      let videoSrc = "";
      const files = [];

      try {
        if (thumbFile) {
          setStatus(msgEl, "썸네일 업로드 중...", "info");
          const ext = extFromName(thumbFile.name) || ".png";
          thumbnailUrl = await uploadFile({
            storage,
            path: `courses/${courseId}/thumb${ext}`,
            file: thumbFile,
            onProgress: (pct) => (thumbProgress ? (thumbProgress.value = pct) : undefined),
          });
        }

        if (videoFile) {
          setStatus(msgEl, "영상 업로드 중...", "info");
          const ext = extFromName(videoFile.name) || ".mp4";
          videoSrc = await uploadFile({
            storage,
            path: `courses/${courseId}/video${ext}`,
            file: videoFile,
            onProgress: (pct) => (videoProgress ? (videoProgress.value = pct) : undefined),
          });
        }

        if (attachFiles.length) {
          setStatus(msgEl, "첨부파일 업로드 중...", "info");
          for (let i = 0; i < attachFiles.length; i++) {
            const f = attachFiles[i];
            const prog = $(`attachProgress_${i}`);
            const url = await uploadFile({
              storage,
              path: `courses/${courseId}/files/${now}_${f.name}`,
              file: f,
              onProgress: (pct) => (prog ? (prog.value = pct) : undefined),
            });
            files.push({ name: f.name, description: "", url });
          }
        }

        setStatus(msgEl, "Firestore 저장 중...", "info");

        // Keep existing urls if not uploading
        const existingSnap = await getDoc(courseRef);
        const existing = existingSnap.exists() ? existingSnap.data() : {};

        const payload = {
          title,
          shortDescription,
          priceKrw: Number.isFinite(priceKrw) ? priceKrw : 0,
          durationDays: Number.isFinite(durationDays) ? durationDays : 0,
          startDate,
          categoryId,
          isNew,
          isPopular,
          published,
          inviteFreeOpen,
          thumbnailUrl: thumbnailUrl || existing.thumbnailUrl || "",
          video: {
            src: videoSrc || existing.video?.src || "",
            poster: existing.video?.poster || "",
          },
          content: {
            overview,
            bullets,
          },
          resources,
          files: files.length ? files : existing.files || [],
          updatedAt: serverTimestamp(),
        };

        if (!existingSnap.exists()) payload.createdAt = serverTimestamp();

        await setDoc(courseRef, payload, { merge: true });

        setStatus(msgEl, `저장 완료! courseId = ${courseId}`, "success");
        resultEl.innerHTML = `
          <div class="file-item">
            <div style="font-weight:900;">바로가기</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
              <a class="link" href="./lesson.html?id=${encodeURIComponent(courseId)}">상세(lesson)</a>
              <a class="link" href="./course.html">카탈로그(course)</a>
              <a class="link" href="./admin.html?id=${encodeURIComponent(courseId)}">이 강의 수정</a>
            </div>
          </div>
        `;
      } catch (err) {
        console.error(err);
        setStatus(msgEl, `저장 실패: ${err?.message || "알 수 없는 오류"}`, "error");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", boot);

