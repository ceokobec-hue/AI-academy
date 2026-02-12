import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

import { firebaseConfig } from "./firebase-config.js";

const CONFIG_PLACEHOLDER = "YOUR_";
const ADMIN_EMAIL = "mentor0329@hanmail.net";

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

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(el, text, tone = "info") {
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

function isAdmin(user) {
  return typeof user?.email === "string" && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function parseTags(text) {
  return String(text || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function uploadImage({ storage, path, file, progressEl }) {
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file);
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        const pct = snap.totalBytes
          ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          : 0;
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

async function fetchCurrentMission(db) {
  const snap = await getDoc(doc(db, "missions", "current"));
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  return {
    id: "current",
    title: String(d.title || ""),
    description: String(d.description || ""),
    example: String(d.example || ""),
    thumbnailUrl: String(d.thumbnailUrl || ""),
    updatedAt: d.updatedAt || null,
  };
}

function renderMission(mission, user) {
  const thumbWrap = $("missionThumb");
  const thumbImg = $("missionThumbImg");
  const thumbUrl = String(mission?.thumbnailUrl || "").trim();
  if (thumbWrap && thumbImg) {
    if (thumbUrl) {
      thumbImg.src = thumbUrl;
      thumbWrap.hidden = false;
    } else {
      thumbImg.removeAttribute("src");
      thumbWrap.hidden = true;
    }
  }

  $("missionTitle").textContent = mission?.title || "오늘의 미션이 아직 없어요.";
  $("missionDesc").textContent = mission?.description || "관리자가 미션을 올리면 여기에서 보여줄게.";
  $("missionExample").textContent = mission?.example || "예시가 아직 없어요.";

  const hint = $("missionHint");
  if (hint) {
    hint.textContent = user
      ? "미션 인증은 사진/텍스트 아무거나 올려도 OK."
      : "미션 인증을 하려면 로그인부터 해줘.";
  }

  const actions = $("missionActions");
  if (actions) {
    actions.innerHTML = user
      ? `<button class="btn btn-primary" type="button" id="btnMissionPostTop">인증하기</button>`
      : `<a class="btn btn-primary" href="./login.html">로그인</a>`;
    if (user && isAdmin(user)) {
      actions.innerHTML += ` <a class="btn btn-ghost" href="./admin-community.html">미션 올리기</a>`;
    }
  }
}

function postCard(post, { showStatus = false }) {
  const img = post.imageUrl
    ? `<div class="post-image"><img src="${esc(post.imageUrl)}" alt="" loading="lazy" decoding="async" /></div>`
    : "";
  const tags =
    post.tags?.length
      ? `<div class="tag-row">${post.tags
          .map((t) => `<span class="tag">#${esc(t)}</span>`)
          .join("")}</div>`
      : "";

  const statusBadge =
    showStatus && post.type === "question"
      ? post.status === "solved"
        ? `<span class="badge badge-success">해결됨</span>`
        : `<span class="badge badge-primary">미해결</span>`
      : "";

  return `
    <article class="post-card">
      <div class="post-head">
        <div class="post-title-row">
          ${statusBadge}
          <h3 class="post-title">${esc(post.title)}</h3>
        </div>
        <div class="post-meta">${esc(post.authorName || "익명")} · ${esc(post.createdAtText || "")}</div>
      </div>
      ${img}
      <p class="post-body">${esc(post.body)}</p>
      ${tags}
    </article>
  `;
}

function toDateText(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
    2,
    "0",
  )}`;
}

async function fetchRecentPosts(db) {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(60));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      type: data.type || "",
      status: data.status || "open",
      missionId: data.missionId || "",
      title: data.title || "",
      body: data.body || "",
      prompt: data.prompt || "",
      imageUrl: data.imageUrl || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      authorName: data.author?.displayName || data.author?.email || "익명",
      createdAtText: toDateText(data.createdAt),
      createdAt: data.createdAt || null,
    };
  });
}

function renderFeeds(posts) {
  const mission = posts.filter((p) => p.type === "mission");
  const questions = posts.filter((p) => p.type === "question");

  const missionFeed = $("missionFeed");
  const questionFeed = $("questionFeed");

  if (missionFeed) {
    missionFeed.innerHTML = mission.length
      ? mission.map((p) => postCard(p, { showStatus: false })).join("")
      : `<div class="card empty-card">아직 인증 글이 없어. 첫 번째로 올려볼래?</div>`;
  }

  if (questionFeed) {
    const filter = $("questionFilter")?.value || "all";
    const filtered =
      filter === "all"
        ? questions
        : filter === "solved"
          ? questions.filter((q) => q.status === "solved")
          : questions.filter((q) => q.status !== "solved");

    questionFeed.innerHTML = filtered.length
      ? filtered.map((p) => postCard(p, { showStatus: true })).join("")
      : `<div class="card empty-card">질문이 아직 없어. 궁금한 거 하나 올려봐.</div>`;
  }
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
      document.getElementById(`tab_${tab}`)?.classList.add("is-active");
    });
  });
}

function openPostModal({ mode }) {
  const modal = $("postModal");
  const titleEl = $("postModalTitle");
  const tagsWrap = $("postTagsWrap");
  const promptWrap = $("postPromptWrap");
  const imgWrap = $("postImageWrap");
  const msgEl = $("postMsg");

  if (!modal || !titleEl || !tagsWrap || !promptWrap || !imgWrap || !msgEl) return;

  modal.dataset.mode = mode;
  titleEl.textContent = mode === "mission" ? "미션 인증 올리기" : "질문 올리기";
  tagsWrap.style.display = mode === "question" ? "" : "none";
  promptWrap.style.display = mode === "mission" ? "" : "none";
  imgWrap.style.display = mode === "mission" ? "" : "none";

  $("postTitle").value = "";
  $("postBody").value = "";
  $("postTags").value = "";
  $("postPrompt").value = "";
  $("postImage").value = "";
  $("postImageProgress").value = 0;
  setStatus(msgEl, "");

  modal.showModal();
}

async function boot() {
  wireTabs();

  const fb = ensureFirebase();
  const mission = fb ? await fetchCurrentMission(fb.db).catch(() => null) : null;

  let currentUser = null;

  const missionPanelActions = $("missionPanelActions");
  const questionPanelActions = $("questionPanelActions");

  if (questionPanelActions) {
    questionPanelActions.innerHTML = `<button class="btn btn-primary btn-sm" type="button" id="btnQuestionPost">질문하기</button>`;
  }
  if (missionPanelActions) {
    missionPanelActions.innerHTML = `<button class="btn btn-primary btn-sm" type="button" id="btnMissionPost">인증하기</button>`;
  }

  $("btnMissionPost")?.addEventListener("click", () => openPostModal({ mode: "mission" }));
  $("btnQuestionPost")?.addEventListener("click", () => openPostModal({ mode: "question" }));
  document.addEventListener("click", (e) => {
    if (e.target?.id === "btnMissionPostTop") openPostModal({ mode: "mission" });
  });

  $("postClose")?.addEventListener("click", () => $("postModal")?.close());
  $("postCancel")?.addEventListener("click", () => $("postModal")?.close());

  $("questionFilter")?.addEventListener("change", async () => {
    if (!fb) return;
    const posts = await fetchRecentPosts(fb.db).catch(() => []);
    renderFeeds(posts);
  });

  const form = $("postForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!fb) return;
    if (!currentUser) {
      alert("로그인이 필요해.");
      window.location.href = "./login.html";
      return;
    }

    const mode = $("postModal")?.dataset?.mode || "mission";
    const msgEl = $("postMsg");
    setStatus(msgEl, "저장 중...", "info");

    const title = String($("postTitle").value || "").trim();
    const body = String($("postBody").value || "").trim();
    const tags = parseTags($("postTags").value);
    const prompt = String($("postPrompt").value || "").trim();

    if (!title || !body) {
      setStatus(msgEl, "제목/내용을 입력해줘.", "error");
      return;
    }

    try {
      // 1) 글 먼저 생성
      const postRef = await addDoc(collection(fb.db, "posts"), {
        type: mode,
        status: mode === "question" ? "open" : "",
        missionId: mode === "mission" ? "current" : "",
        title,
        body,
        tags: mode === "question" ? tags : [],
        prompt: mode === "mission" ? prompt : "",
        imageUrl: "",
        author: {
          uid: currentUser.uid,
          email: currentUser.email || "",
          displayName: currentUser.displayName || "",
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2) 이미지 업로드(미션)
      if (mode === "mission") {
        const file = $("postImage")?.files?.[0] || null;
        if (file) {
          const progressEl = $("postImageProgress");
          const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
          const url = await uploadImage({
            storage: fb.storage,
            path: `community/missions/current/posts/${postRef.id}.${ext}`,
            file,
            progressEl,
          });
          await updateDoc(doc(fb.db, "posts", postRef.id), {
            imageUrl: url,
            updatedAt: serverTimestamp(),
          });
        }
      }

      setStatus(msgEl, "완료! 목록을 새로 불러올게.", "success");
      window.setTimeout(() => $("postModal")?.close(), 500);
    } catch (err) {
      console.error(err);
      setStatus(msgEl, `실패: ${err?.message || "오류"}`, "error");
    }

    const posts = await fetchRecentPosts(fb.db).catch(() => []);
    renderFeeds(posts);
  });

  if (!fb) {
    renderMission(mission, null);
    renderFeeds([]);
    return;
  }

  onAuthStateChanged(fb.auth, async (user) => {
    currentUser = user;
    renderMission(mission, user);

    // 버튼 접근성: 로그인 없으면 로그인 안내로 바꾸기
    if (!user) {
      $("missionPanelActions").innerHTML = `<a class="btn btn-primary btn-sm" href="./login.html">로그인 후 인증</a>`;
      $("questionPanelActions").innerHTML = `<a class="btn btn-primary btn-sm" href="./login.html">로그인 후 질문</a>`;
    }

    const posts = await fetchRecentPosts(fb.db).catch(() => []);
    renderFeeds(posts);
  });
}

document.addEventListener("DOMContentLoaded", boot);

