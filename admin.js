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
  const categorySelect = $("categoryId");
  const price30El = $("priceKrw");
  const price90El = $("priceKrw90");
  const cat30El = $("catPrice30");
  const cat90El = $("catPrice90");
  const saveCatDefaultsEl = $("saveCategoryPricingDefaults");

  if (!fb) {
    setWarn("Firebase 설정이 없거나 storageBucket이 비어있습니다. firebase-config.js를 확인해 주세요.");
    gate.style.display = "block";
    form.style.display = "none";
    return;
  }

  const { auth, db, storage } = fb;
  const categories = await fetchCategories(db);
  fillCategorySelect(categorySelect, categories);

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
        } else {
          resultEl.innerHTML = `<p class="hint" style="margin:0;">문서가 없어 새로 생성합니다: <b>${editId}</b></p>`;
          $("courseId").value = editId;
        }
      } catch (e) {
        console.error(e);
      }
    }

    wirePricingCalculator();
    await applyCategoryPricingDefaultsIfNeeded();

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

