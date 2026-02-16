import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
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

function formatDurationLabel(seconds) {
  const s = Number(seconds || 0);
  if (!Number.isFinite(s) || s <= 0) return "";
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}시간 ${mm}분` : `${h}시간`;
}

function extractVideoDurationSec(url, { timeoutMs = 20000 } = {}) {
  const src = String(url || "").trim();
  if (!src) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";

    let done = false;
    const cleanup = () => {
      try {
        v.removeAttribute("src");
        v.load();
      } catch {
        // ignore
      }
    };

    const t = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("영상 메타데이터 로딩 시간이 초과되었습니다."));
    }, timeoutMs);

    v.addEventListener("loadedmetadata", () => {
      if (done) return;
      done = true;
      window.clearTimeout(t);
      const dur = Number(v.duration || 0);
      cleanup();
      if (!Number.isFinite(dur) || dur <= 0) {
        reject(new Error("영상 길이를 읽지 못했습니다. (URL/CORS/권한/형식 확인)"));
        return;
      }
      resolve(Math.round(dur));
    });

    v.addEventListener("error", () => {
      if (done) return;
      done = true;
      window.clearTimeout(t);
      cleanup();
      reject(new Error("영상 로딩에 실패했습니다. (URL/CORS/권한 확인)"));
    });

    v.src = src;
  });
}

function extractVideoDurationSecFromFile(file, { timeoutMs = 20000 } = {}) {
  if (!file) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;

    let done = false;
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
      try {
        v.removeAttribute("src");
        v.load();
      } catch {
        // ignore
      }
    };

    const t = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("영상 메타데이터 로딩 시간이 초과되었습니다."));
    }, timeoutMs);

    v.addEventListener("loadedmetadata", () => {
      if (done) return;
      done = true;
      window.clearTimeout(t);
      const dur = Number(v.duration || 0);
      cleanup();
      if (!Number.isFinite(dur) || dur <= 0) {
        reject(new Error("영상 길이를 읽지 못했습니다. (파일 형식 확인)"));
        return;
      }
      resolve(Math.round(dur));
    });

    v.addEventListener("error", () => {
      if (done) return;
      done = true;
      window.clearTimeout(t);
      cleanup();
      reject(new Error("영상 로딩에 실패했습니다. (파일 형식 확인)"));
    });

    v.src = objectUrl;
  });
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

function roundToMarketing9900(price) {
  const n = Number(price || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // 9,900 / 19,900 / 29,900 ... 형태로 맞추기
  // ex) 59000 -> 59900, 129000 -> 129900
  const unit = 10000;
  const rounded = Math.ceil(n / unit) * unit - 100;
  return Math.max(9900, rounded);
}

function calc90From30(price30, ratio) {
  const base = Number(price30 || 0) * Number(ratio || 0);
  return roundToMarketing9900(base);
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
  const deleteBtn = $("btnSoftDelete");
  const categorySelect = $("categoryId");
  const catManageIdEl = $("catManageId");
  const catManageNameEl = $("catManageName");
  const catManageOrderEl = $("catManageOrder");
  const catManageMsgEl = $("catManageMsg");
  const catOrderListEl = $("catOrderList");
  const catOrderMsgEl = $("catOrderMsg");
  const btnCatLoadFromSelect = $("btnCatLoadFromSelect");
  const btnCatSave = $("btnCatSave");
  const price30El = $("priceKrw");
  const price90El = $("priceKrw90");
  const cat30El = $("catPrice30");
  const cat90El = $("catPrice90");
  const saveCatDefaultsEl = $("saveCategoryPricingDefaults");
  const lessonFieldset = $("lessonAdminFieldset");
  const lessonListEl = $("lessonAdminList");
  const lessonOrderEl = $("lessonOrder");
  const lessonTitleEl = $("lessonTitle");
  const lessonIsFreeEl = $("lessonIsFree");
  const lessonVideoUrlEl = $("lessonVideoUrl");
  const lessonVideoFileEl = $("lessonVideoFile");
  const lessonVideoProgressEl = $("lessonVideoProgress");
  const lessonDurationSecEl = $("lessonDurationSec");
  const lessonDurationHintEl = $("lessonDurationHint");
  const lessonAdminMsgEl = $("lessonAdminMsg");
  const btnLessonAutoDuration = $("btnLessonAutoDuration");
  const btnLessonSave = $("btnLessonSave");
  const btnLessonReset = $("btnLessonReset");

  if (!fb) {
    setWarn("Firebase 설정이 없거나 storageBucket이 비어있습니다. firebase-config.js를 확인해 주세요.");
    gate.style.display = "block";
    form.style.display = "none";
    return;
  }

  const { auth, db, storage } = fb;
  let categories = await fetchCategories(db);
  fillCategorySelect(categorySelect, categories);

  let lessonEditId = "";

  function setLessonMsg(text, tone = "muted") {
    if (!lessonAdminMsgEl) return;
    lessonAdminMsgEl.textContent = text;
    lessonAdminMsgEl.style.color =
      tone === "error"
        ? "rgba(255, 140, 140, 0.95)"
        : tone === "success"
          ? "rgba(120, 255, 190, 0.95)"
          : "rgba(255, 255, 255, 0.7)";
  }

  function resetLessonForm() {
    lessonEditId = "";
    if (lessonOrderEl) lessonOrderEl.value = "";
    if (lessonTitleEl) lessonTitleEl.value = "";
    if (lessonIsFreeEl) lessonIsFreeEl.checked = false;
    if (lessonVideoUrlEl) lessonVideoUrlEl.value = "";
    if (lessonVideoFileEl) lessonVideoFileEl.value = "";
    if (lessonVideoProgressEl) lessonVideoProgressEl.value = 0;
    if (lessonDurationSecEl) lessonDurationSecEl.value = "";
    if (lessonDurationHintEl) lessonDurationHintEl.textContent = "";
    setLessonMsg("");
    if (btnLessonSave) btnLessonSave.textContent = "레슨 저장(추가/수정)";
  }

  async function loadLessons(courseId) {
    if (!lessonListEl) return;
    if (!courseId) {
      lessonListEl.innerHTML = `<p class="muted" style="margin:0;">courseId가 없습니다. 먼저 강의를 저장한 뒤 수정 모드로 들어와 주세요.</p>`;
      return;
    }
    try {
      const q = query(collection(db, "courses", courseId, "lessons"), orderBy("order", "asc"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      if (!list.length) {
        lessonListEl.innerHTML = `<p class="muted" style="margin:0;">아직 레슨이 없습니다. 위에서 추가해 주세요.</p>`;
        return;
      }
      lessonListEl.innerHTML = `
        <div class="lesson-admin-table">
          ${list
            .map((l, idx) => {
              const order = Number(l.order || idx + 1);
              const title = String(l.title || "").trim() || `${order}강`;
              const url = String(l.video?.src || l.videoSrc || "");
              const dur = Number(l.durationSec || 0);
              const durLabel = formatDurationLabel(dur);
              const safeUrl = url ? `<a class="link" href="${url}" target="_blank" rel="noopener noreferrer">열기</a>` : `<span class="muted">-</span>`;
              const freeBadge = l.isFree ? ` <span class="badge badge-success">무료</span>` : "";
              return `
                <div class="lesson-admin-row">
                  <div class="lesson-admin-main">
                    <div style="font-weight:900;">${order}강: ${title}${freeBadge} ${durLabel ? `<span class="muted">(${durLabel})</span>` : ""}</div>
                    <div class="muted" style="word-break:break-all;">${safeUrl} <span class="muted">· id: ${l.id}</span></div>
                  </div>
                  <div class="lesson-admin-actions">
                    <button class="btn btn-ghost btn-sm" type="button" data-lesson-edit="${l.id}">수정</button>
                    <button class="btn btn-danger btn-sm" type="button" data-lesson-del="${l.id}">삭제</button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;

      lessonListEl.querySelectorAll("[data-lesson-edit]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-lesson-edit") || "";
          const item = list.find((x) => x.id === id);
          if (!item) return;
          lessonEditId = id;
          if (lessonOrderEl) lessonOrderEl.value = String(Number(item.order || 1));
          if (lessonTitleEl) lessonTitleEl.value = String(item.title || "");
          if (lessonIsFreeEl) lessonIsFreeEl.checked = item.isFree === true;
          if (lessonVideoUrlEl) lessonVideoUrlEl.value = String(item.video?.src || item.videoSrc || "");
          const dur = Number(item.durationSec || 0);
          if (lessonDurationSecEl) lessonDurationSecEl.value = dur > 0 ? String(dur) : "";
          if (lessonDurationHintEl) lessonDurationHintEl.textContent = dur > 0 ? `표시: ${formatDurationLabel(dur)}` : "";
          if (btnLessonSave) btnLessonSave.textContent = "레슨 저장(수정)";
          setLessonMsg(`수정 모드: ${id}`);
          window.scrollTo({ top: lessonFieldset?.offsetTop || 0, behavior: "smooth" });
        });
      });

      lessonListEl.querySelectorAll("[data-lesson-del]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-lesson-del") || "";
          if (!id) return;
          const ok = window.confirm("이 레슨을 삭제할까요? (복구 불가)");
          if (!ok) return;
          try {
            await deleteDoc(doc(db, "courses", courseId, "lessons", id));
            setLessonMsg("레슨 삭제 완료", "success");
            await loadLessons(courseId);
            if (lessonEditId === id) resetLessonForm();
          } catch (e) {
            console.error(e);
            setLessonMsg(`삭제 실패: ${e?.message || "알 수 없는 오류"}`, "error");
          }
        });
      });
    } catch (e) {
      console.error(e);
      lessonListEl.innerHTML = `<p class="muted" style="margin:0;">레슨을 불러오지 못했습니다: ${e?.message || "오류"}</p>`;
    }
  }

  async function applyCategoryPricingDefaultsIfNeeded() {
    const categoryId = String(categorySelect?.value || "").trim();
    if (!categoryId) return;
    if (!cat30El || !cat90El) return;

    // 사용자가 직접 입력했으면 자동 덮어쓰지 않음
    const touched = cat30El.dataset.touched === "true";
    const current = Number(cat30El.value || 0);
    if (touched && current > 0) return;

    try {
      const snap = await getDoc(doc(db, "categories", categoryId));
      if (!snap.exists()) return;
      const data = snap.data() || {};
      const defaults = data.pricingDefaults || {};
      const d30 = Number(defaults.category30 || 0);
      if (d30 > 0) {
        cat30El.value = String(d30);
        cat90El.value = String(Number(defaults.category90 || 0) || calc90From30(d30, 2.0));
      } else if (!cat90El.value) {
        cat90El.value = String(calc90From30(Number(cat30El.value || 0), 2.0));
      }
    } catch (e) {
      console.warn("Failed to load category pricing defaults.", e);
    }
  }

  function wirePricingCalculator() {
    if (price30El && price90El) {
      price30El.addEventListener("input", () => {
        const v = Number(price30El.value || 0);
        price90El.value = v > 0 ? String(calc90From30(v, 2.2)) : "";
      });
      // initial fill
      const v0 = Number(price30El.value || 0);
      if (v0 > 0 && !price90El.value) price90El.value = String(calc90From30(v0, 2.2));
    }

    if (cat30El && cat90El) {
      cat30El.addEventListener("input", () => {
        cat30El.dataset.touched = "true";
        const v = Number(cat30El.value || 0);
        cat90El.value = v > 0 ? String(calc90From30(v, 2.0)) : "";
      });
      const v0 = Number(cat30El.value || 0);
      if (v0 > 0 && !cat90El.value) cat90El.value = String(calc90From30(v0, 2.0));
    }

    categorySelect?.addEventListener("change", async () => {
      // 카테고리 바뀌면 기본가격 자동 채움(비어있을 때)
      if (cat30El) cat30El.dataset.touched = "";
      await applyCategoryPricingDefaultsIfNeeded();
    });
  }

  function setCatManageMsg(text, tone = "muted") {
    if (!catManageMsgEl) return;
    catManageMsgEl.textContent = text;
    catManageMsgEl.style.color =
      tone === "error"
        ? "rgba(255, 140, 140, 0.95)"
        : tone === "success"
          ? "rgba(120, 255, 190, 0.95)"
          : "rgba(255, 255, 255, 0.7)";
  }

  function setCatOrderMsg(text, tone = "muted") {
    if (!catOrderMsgEl) return;
    catOrderMsgEl.textContent = text;
    catOrderMsgEl.style.color =
      tone === "error"
        ? "rgba(255, 140, 140, 0.95)"
        : tone === "success"
          ? "rgba(120, 255, 190, 0.95)"
          : "rgba(255, 255, 255, 0.7)";
  }

  async function upsertCategory({ id, name, order }) {
    const catId = String(id || "").trim();
    const catName = String(name || "").trim();
    const catOrder = Number(order || 0);
    if (!catId) throw new Error("카테고리 ID가 필요합니다.");
    if (!catName) throw new Error("카테고리 이름이 필요합니다.");
    if (!Number.isFinite(catOrder) || catOrder <= 0) throw new Error("정렬 순서(order)는 1 이상의 숫자여야 합니다.");

    const ref = doc(db, "categories", catId);
    const snap = await getDoc(ref);
    const payload = {
      name: catName,
      order: Math.round(catOrder),
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) payload.createdAt = serverTimestamp();
    await setDoc(ref, payload, { merge: true });
  }

  async function ensureDefaultCategories() {
    // Firestore에 categories가 일부만 있으면, catalog.js가 Firestore 목록만 사용해서
    // 화면에 그 일부만 보이게 됩니다. 따라서 기본 카테고리 세트를 항상 맞춰둡니다.
    const defaults = (Array.isArray(DEFAULT_CATEGORIES) ? DEFAULT_CATEGORIES : []).slice();
    if (!defaults.length) return;

    for (const c of defaults) {
      try {
        const ref = doc(db, "categories", String(c.id || "").trim());
        const snap = await getDoc(ref);
        if (snap.exists()) continue; // 이미 있으면 덮어쓰지 않음(관리자가 order를 바꿀 수 있어야 함)
        await setDoc(
          ref,
          {
            name: String(c.name || "").trim(),
            order: Number(c.order || 0) || 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (e) {
        console.warn("Failed to ensure default category:", c?.id, e);
      }
    }
  }

  function renderCategoryOrderList() {
    if (!catOrderListEl) return;
    const list = (Array.isArray(categories) ? categories : [])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (!list.length) {
      catOrderListEl.innerHTML = `<p class="muted" style="margin:0;">카테고리가 없습니다.</p>`;
      return;
    }

    catOrderListEl.innerHTML = `
      <div class="lesson-admin-table">
        ${list
          .map((c, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === list.length - 1;
            const order = Number(c.order || idx + 1);
            const name = String(c.name || "").trim() || c.id;
            return `
              <div class="lesson-admin-row">
                <div class="lesson-admin-main">
                  <div style="font-weight:900;">${order}. ${name}</div>
                  <div class="muted">id: ${String(c.id || "")}</div>
                </div>
                <div class="lesson-admin-actions">
                  <button class="btn btn-ghost btn-sm" type="button" data-cat-move="up" data-cat-id="${String(
                    c.id || "",
                  )}" ${isFirst ? "disabled" : ""}>↑</button>
                  <button class="btn btn-ghost btn-sm" type="button" data-cat-move="down" data-cat-id="${String(
                    c.id || "",
                  )}" ${isLast ? "disabled" : ""}>↓</button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  async function moveCategoryOrder({ id, dir }) {
    const list = (Array.isArray(categories) ? categories : [])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = list.findIndex((c) => String(c.id) === String(id));
    if (idx < 0) return;
    const otherIdx = dir === "up" ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= list.length) return;

    const a = list[idx];
    const b = list[otherIdx];
    const aRef = doc(db, "categories", a.id);
    const bRef = doc(db, "categories", b.id);
    const aOrder = Number(a.order || 0) || idx + 1;
    const bOrder = Number(b.order || 0) || otherIdx + 1;

    const batch = writeBatch(db);
    batch.update(aRef, { order: bOrder, updatedAt: serverTimestamp() });
    batch.update(bRef, { order: aOrder, updatedAt: serverTimestamp() });
    await batch.commit();
  }

  async function reloadCategoriesAndSelect(idToSelect = "") {
    categories = await fetchCategories(db);
    fillCategorySelect(categorySelect, categories);
    renderCategoryOrderList();
    if (idToSelect) {
      try {
        categorySelect.value = idToSelect;
      } catch {
        // ignore
      }
    }
  }

  function loadManageFormFromSelected() {
    const id = String(categorySelect?.value || "").trim();
    const item = categories.find((c) => String(c.id) === id) || null;
    if (catManageIdEl) catManageIdEl.value = id || "";
    if (catManageNameEl) catManageNameEl.value = item?.name || "";
    if (catManageOrderEl) catManageOrderEl.value = item?.order ? String(item.order) : "";
    setCatManageMsg(id ? `불러옴: ${id}` : "");
  }

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

    // 기본 카테고리 세트 Firestore에 자동 복구/동기화
    try {
      await ensureDefaultCategories();
      await reloadCategoriesAndSelect(String(categorySelect?.value || "").trim());
      setCatManageMsg("기본 카테고리를 Firestore에 동기화했습니다.", "success");
    } catch (e) {
      console.warn("Failed to ensure default categories exist.", e);
    }

    // 카테고리 관리 UI wiring
    if (catOrderListEl && catOrderListEl.dataset.wired !== "true") {
      catOrderListEl.dataset.wired = "true";
      catOrderListEl.addEventListener("click", async (e) => {
        const btn = e.target?.closest?.("button[data-cat-move][data-cat-id]");
        if (!btn) return;
        const dir = btn.getAttribute("data-cat-move") || "";
        const id = btn.getAttribute("data-cat-id") || "";
        if (!id || (dir !== "up" && dir !== "down")) return;

        btn.disabled = true;
        setCatOrderMsg("순서 변경 중…");
        try {
          await moveCategoryOrder({ id, dir });
          await reloadCategoriesAndSelect(String(categorySelect?.value || "").trim());
          loadManageFormFromSelected();
          setCatOrderMsg("순서를 변경했습니다.", "success");
        } catch (err) {
          console.error(err);
          setCatOrderMsg(`순서 변경 실패: ${String(err?.message || err)}`, "error");
        }
      });
    }

    btnCatLoadFromSelect?.addEventListener("click", () => {
      loadManageFormFromSelected();
    });
    btnCatSave?.addEventListener("click", async () => {
      if (!btnCatSave) return;
      btnCatSave.disabled = true;
      const prev = btnCatSave.textContent;
      btnCatSave.textContent = "저장 중…";
      try {
        const id = String(catManageIdEl?.value || "").trim();
        const name = String(catManageNameEl?.value || "").trim();
        const order = Number(catManageOrderEl?.value || 0);
        await upsertCategory({ id, name, order });
        await reloadCategoriesAndSelect(id);
        setCatManageMsg(`저장 완료: ${id}`, "success");
      } catch (e) {
        console.error(e);
        setCatManageMsg(`저장 실패: ${String(e?.message || e)}`, "error");
      } finally {
        btnCatSave.disabled = false;
        btnCatSave.textContent = prev || "카테고리 저장(추가/수정)";
      }
    });

    // 최초 1회: 선택된 카테고리 값을 관리폼에 채우기
    try {
      loadManageFormFromSelected();
    } catch {
      // ignore
    }

    // Edit mode
    const editId = getCourseIdFromUrl();
    if (editId) {
      try {
        const course = await loadCourseForEdit({ db, courseId: editId });
        if (course) {
          $("courseId").value = course.id || editId;
          $("title").value = course.title || "";
          $("shortDescription").value = course.shortDescription || "";
          $("priceKrw").value = course.pricing?.single30 ?? course.priceKrw ?? "";
          if (price90El) {
            price90El.value = String(
              Number(course.pricing?.single90 || 0) || calc90From30(Number($("priceKrw").value || 0), 2.2) || "",
            );
          }
          $("durationDays").value = course.durationDays ?? "";
          $("startDate").value = course.startDate || "";
          $("categoryId").value = course.categoryId || categories[0]?.id || "";
          form.querySelector('input[name="isNew"]').checked = !!course.isNew;
          form.querySelector('input[name="isPopular"]').checked = !!course.isPopular;
          form.querySelector('input[name="published"]').checked = course.published !== false;
          form.querySelector('input[name="inviteFreeOpen"]').checked = !!course.inviteFreeOpen;
          if (cat30El) cat30El.value = course.pricing?.category30 ?? "";
          if (cat90El) {
            const c30 = Number(cat30El?.value || 0);
            cat90El.value = String(Number(course.pricing?.category90 || 0) || (c30 ? calc90From30(c30, 2.0) : "") || "");
          }
          $("overview").value = course.content?.overview || "";
          $("bullets").value = (course.content?.bullets || []).join("\n");
          const r0 = (course.resources || [])[0] || {};
          $("resourceTitle").value = r0.title || "";
          $("resourceDesc").value = r0.description || "";
          $("resourceCode").value = r0.code || "";
          resultEl.innerHTML = `<p class="hint" style="margin:0;">수정 모드: <b>${editId}</b></p>`;

          // 소프트 삭제 버튼 노출
          if (deleteBtn) {
            deleteBtn.style.display = "inline-flex";
            deleteBtn.disabled = false;
          }

          // 이미 삭제/비공개인 경우 힌트 표시
          const isDeleted = course.deleted === true;
          const isPublished = course.published !== false;
          if (isDeleted || !isPublished) {
            const extra = isDeleted ? " (삭제됨/숨김 처리됨)" : " (비공개 상태)";
            resultEl.innerHTML = `<p class="hint" style="margin:0;">수정 모드: <b>${editId}</b>${extra}</p>`;
          }
        } else {
          resultEl.innerHTML = `<p class="hint" style="margin:0;">문서가 없어 새로 생성합니다: <b>${editId}</b></p>`;
          $("courseId").value = editId;
          if (deleteBtn) deleteBtn.style.display = "none";
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      if (deleteBtn) deleteBtn.style.display = "none";
    }

    // 레슨 관리(목차) - 수정 모드에서만 활성
    if (lessonFieldset) {
      lessonFieldset.style.display = editId ? "" : "none";
    }
    if (editId) {
      resetLessonForm();
      await loadLessons(editId);
    }

    btnLessonReset?.addEventListener("click", () => resetLessonForm());
    btnLessonAutoDuration?.addEventListener("click", async () => {
      const url = String(lessonVideoUrlEl?.value || "").trim();
      const file = lessonVideoFileEl?.files?.[0] || null;
      if (!url && !file) {
        setLessonMsg("영상 URL을 입력하거나 파일을 선택해 주세요.", "error");
        return;
      }
      setLessonMsg("영상 길이 계산 중...", "muted");
      try {
        const sec = file ? await extractVideoDurationSecFromFile(file) : await extractVideoDurationSec(url);
        if (lessonDurationSecEl) lessonDurationSecEl.value = String(sec);
        if (lessonDurationHintEl) lessonDurationHintEl.textContent = `표시: ${formatDurationLabel(sec)}`;
        setLessonMsg("자동 계산 완료", "success");
      } catch (e) {
        console.error(e);
        if (lessonDurationSecEl) lessonDurationSecEl.value = "";
        if (lessonDurationHintEl) lessonDurationHintEl.textContent = "";
        setLessonMsg(e?.message || "자동 계산 실패", "error");
      }
    });

    btnLessonSave?.addEventListener("click", async () => {
      const courseId = String(getCourseIdFromUrl() || "").trim();
      if (!courseId) {
        setLessonMsg("수정 모드에서만 레슨을 저장할 수 있습니다.", "error");
        return;
      }
      const order = Number(lessonOrderEl?.value || 0);
      const title = String(lessonTitleEl?.value || "").trim();
      const isFree = lessonIsFreeEl?.checked === true;
      let videoUrl = String(lessonVideoUrlEl?.value || "").trim();
      const videoFile = lessonVideoFileEl?.files?.[0] || null;
      let durationSec = Number(lessonDurationSecEl?.value || 0);

      if (!Number.isFinite(order) || order < 1) {
        setLessonMsg("순서(order)는 1 이상의 숫자여야 합니다.", "error");
        return;
      }
      if (!title) {
        setLessonMsg("소제목(레슨 제목)을 입력해 주세요.", "error");
        return;
      }
      if (!videoUrl && !videoFile) {
        setLessonMsg("영상 URL을 입력하거나 파일을 선택해 주세요.", "error");
        return;
      }

      btnLessonSave.disabled = true;
      setLessonMsg("레슨 저장 중...", "muted");

      try {
        const col = collection(db, "courses", courseId, "lessons");
        const ref = lessonEditId ? doc(db, "courses", courseId, "lessons", lessonEditId) : doc(col);
        const now = serverTimestamp();

        // 1) 파일 업로드가 있으면 먼저 업로드해서 URL 확보
        if (videoFile) {
          if (lessonVideoProgressEl) lessonVideoProgressEl.value = 0;
          const ext = extFromName(videoFile.name) || ".mp4";
          const uploadedUrl = await uploadFile({
            storage,
            path: `courses/${courseId}/lessons/${ref.id}/video${ext}`,
            file: videoFile,
            onProgress: (pct) => (lessonVideoProgressEl ? (lessonVideoProgressEl.value = pct) : undefined),
          });
          videoUrl = uploadedUrl;
          if (lessonVideoUrlEl) lessonVideoUrlEl.value = uploadedUrl;
        }

        // 2) 길이 자동 계산(없을 때만)
        if (!Number.isFinite(durationSec) || durationSec <= 0) {
          durationSec = videoFile
            ? await extractVideoDurationSecFromFile(videoFile)
            : await extractVideoDurationSec(videoUrl);
          if (lessonDurationSecEl) lessonDurationSecEl.value = String(durationSec);
          if (lessonDurationHintEl) lessonDurationHintEl.textContent = `표시: ${formatDurationLabel(durationSec)}`;
        }

        const payload = {
          order: Math.round(order),
          title,
          video: { src: videoUrl },
          durationSec: Math.round(durationSec),
          isFree: !!isFree,
          updatedAt: now,
        };
        if (!lessonEditId) payload.createdAt = now;

        await setDoc(ref, payload, { merge: true });
        setLessonMsg("레슨 저장 완료", "success");
        resetLessonForm();
        await loadLessons(courseId);
      } catch (e) {
        console.error(e);
        setLessonMsg(`저장 실패: ${e?.message || "알 수 없는 오류"}`, "error");
      } finally {
        btnLessonSave.disabled = false;
      }
    });

    wirePricingCalculator();
    await applyCategoryPricingDefaultsIfNeeded();

    // 소프트 삭제(숨김) 기능
    deleteBtn?.addEventListener("click", async () => {
      const courseId = String($("courseId")?.value || "").trim();
      if (!courseId) {
        alert("courseId가 비어있습니다. 먼저 수정 모드로 진입해 주세요.");
        return;
      }

      const ok1 = window.confirm(
        "정말 이 강의를 삭제(숨김) 처리할까요?\n\n- 카탈로그/상세에서 숨겨집니다.\n- 기존 수강자 기록은 유지됩니다.\n\n(복구는 관리자에서 '공개'로 다시 저장하면 됩니다.)",
      );
      if (!ok1) return;

      const phrase = window.prompt("삭제를 진행하려면 아래에 '삭제'라고 입력해 주세요.");
      if (phrase !== "삭제") {
        alert("삭제가 취소되었습니다.");
        return;
      }

      deleteBtn.disabled = true;
      setStatus(msgEl, "삭제(숨김) 처리 중...", "info");

      try {
        await updateDoc(doc(db, "courses", courseId), {
          published: false,
          deleted: true,
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // UI 동기화
        const pubCb = form.querySelector('input[name="published"]');
        if (pubCb) pubCb.checked = false;

        setStatus(msgEl, "삭제(숨김) 처리 완료. 카탈로그에서 숨겨졌습니다.", "success");
      } catch (err) {
        console.error(err);
        deleteBtn.disabled = false;
        setStatus(msgEl, `삭제 실패: ${err?.message || "알 수 없는 오류"}`, "error");
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus(msgEl, "", "info");
      resultEl.innerHTML = "";

      const fd = new FormData(form);
      const courseIdInput = String(fd.get("courseId") || "").trim();
      const title = String(fd.get("title") || "").trim();
      const shortDescription = String(fd.get("shortDescription") || "").trim();
      const price30 = Number(fd.get("priceKrw") || 0);
      const price90 = calc90From30(price30, 2.2);
      const catPrice30 = Number(fd.get("catPrice30") || 0);
      const catPrice90 = calc90From30(catPrice30, 2.0);
      const durationDays = Number(fd.get("durationDays") || 0);
      const startDate = String(fd.get("startDate") || "");
      const categoryId = String(fd.get("categoryId") || "").trim();
      const isNew = !!fd.get("isNew");
      const isPopular = !!fd.get("isPopular");
      const published = !!fd.get("published");
      const inviteFreeOpen = !!fd.get("inviteFreeOpen");
      const saveCategoryPricingDefaults = !!fd.get("saveCategoryPricingDefaults");

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
          // 기존 UI/카탈로그 호환: priceKrw는 "단품 30일" 가격으로 유지
          priceKrw: Number.isFinite(price30) ? price30 : 0,
          durationDays: Number.isFinite(durationDays) ? durationDays : 0,
          startDate,
          categoryId,
          isNew,
          isPopular,
          published,
          inviteFreeOpen,
          pricing: {
            single30: Number.isFinite(price30) ? price30 : 0,
            single90: Number.isFinite(price90) ? price90 : 0,
            category30: Number.isFinite(catPrice30) ? catPrice30 : 0,
            category90: Number.isFinite(catPrice90) ? catPrice90 : 0,
            ratios: { single90From30: 2.2, category90From30: 2.0 },
            rounding: "ceil_10000_minus_100",
          },
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

        // 카테고리 기본 가격 업데이트(선택)
        if (saveCategoryPricingDefaults && categoryId) {
          await setDoc(
            doc(db, "categories", categoryId),
            {
              pricingDefaults: {
                category30: Number.isFinite(catPrice30) ? catPrice30 : 0,
                category90: Number.isFinite(catPrice90) ? catPrice90 : 0,
                updatedAt: serverTimestamp(),
              },
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }

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

