import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
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
const ADMIN_NAME = "관리자";
const REACTIONS = [
  { key: "thumb", emoji: "👍" },
  { key: "heart", emoji: "❤️" },
  { key: "fire", emoji: "🔥" },
  { key: "party", emoji: "🎉" },
  { key: "clap", emoji: "👏" },
  { key: "spark", emoji: "✨" },
];

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

function isOwner(post, user) {
  return !!user && typeof post?.authorUid === "string" && post.authorUid === user.uid;
}

function toast(text) {
  const stack = document.querySelector(".toast-stack");
  if (!stack) {
    alert(text);
    return;
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<p class="toast-title" style="margin:0;">알림</p><p class="toast-body">${esc(text)}</p>`;
  stack.appendChild(el);
  window.setTimeout(() => {
    el.style.animation = "toast-out 160ms ease forwards";
    window.setTimeout(() => el.remove(), 180);
  }, 1600);
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

function postCard(post, { showStatus = false, admin = false, owner = false } = {}) {
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

  const answerBox =
    post.type === "question" && post.adminAnswer?.body
      ? `
        <div class="answer-box" aria-label="관리자 답변">
          <div class="answer-head">관리자 답변</div>
          <p class="answer-body">${esc(post.adminAnswer.body)}</p>
        </div>
      `
      : "";

  const actions =
    post.type === "question" && (admin || owner)
      ? `
        <div class="post-actions" aria-label="질문 작업">
          <div class="post-actions-left">
            ${
              owner
                ? `<button class="btn btn-ghost btn-sm" type="button" data-action="editQuestion" data-post-id="${esc(
                    post.id,
                  )}">질문 수정</button>`
                : ""
            }
          </div>
          <div class="post-actions-right">
            ${
              admin
                ? `<button class="btn btn-primary btn-sm" type="button" data-action="adminAnswer" data-post-id="${esc(
                    post.id,
                  )}">${post.adminAnswer?.body ? "답변 수정" : "답변 달기"}</button>`
                : ""
            }
          </div>
        </div>
      `
      : "";

  const reactionRow =
    post.type === "mission"
      ? `
        <div class="reaction-row" aria-label="리액션">
          ${REACTIONS.map((r) => {
            const count = Number(post.reactionCounts?.[r.key] || 0);
            return `
              <button class="btn btn-ghost btn-sm reaction-btn" type="button"
                data-action="react"
                data-post-id="${esc(post.id)}"
                data-reaction-key="${esc(r.key)}">
                <span class="reaction-emoji" aria-hidden="true">${r.emoji}</span>
                <span class="reaction-count" aria-label="카운트">${count}</span>
              </button>
            `;
          }).join("")}
        </div>
      `
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
      ${reactionRow}
      ${answerBox}
      ${actions}
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
  const snap = await getDocsFromServer(q).catch(() => getDocs(q));
  return snap.docs.map((d) => {
    const data = d.data() || {};
    const rawCounts = data.reactionCounts && typeof data.reactionCounts === "object" ? data.reactionCounts : {};
    const reactionCounts = Object.fromEntries(
      REACTIONS.map((r) => [r.key, Number(rawCounts?.[r.key] || 0)]),
    );
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
      authorUid: data.author?.uid || "",
      createdAtText: toDateText(data.createdAt),
      createdAt: data.createdAt || null,
      reactionCounts,
      adminAnswer: data.adminAnswer
        ? {
            body: String(data.adminAnswer.body || ""),
            authorName: String(data.adminAnswer.authorName || ""),
          }
        : null,
    };
  });
}

function renderFeeds(posts, { currentUser } = {}) {
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
      ? filtered
          .map((p) =>
            postCard(p, {
              showStatus: true,
              admin: isAdmin(currentUser),
              owner: isOwner(p, currentUser),
            }),
          )
          .join("")
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

function openPostModal({ mode, post = null }) {
  const modal = $("postModal");
  const titleEl = $("postModalTitle");
  const tagsWrap = $("postTagsWrap");
  const promptWrap = $("postPromptWrap");
  const imgWrap = $("postImageWrap");
  const msgEl = $("postMsg");
  const submitBtn = document.querySelector("#postForm button[type='submit']");

  if (!modal || !titleEl || !tagsWrap || !promptWrap || !imgWrap || !msgEl) return;

  modal.dataset.mode = mode;
  modal.dataset.postId = post?.id || "";
  titleEl.textContent =
    mode === "mission" ? "미션 인증 올리기" : post?.id ? "질문 수정" : "질문 올리기";
  if (submitBtn) submitBtn.textContent = post?.id ? "저장" : "올리기";
  tagsWrap.style.display = mode === "question" ? "" : "none";
  promptWrap.style.display = mode === "mission" ? "" : "none";
  imgWrap.style.display = mode === "mission" ? "" : "none";

  $("postTitle").value = post?.title || "";
  $("postBody").value = post?.body || "";
  $("postTags").value = (post?.tags || []).join(", ");
  $("postPrompt").value = post?.prompt || "";
  $("postImage").value = "";
  $("postImageProgress").value = 0;
  setStatus(msgEl, "");

  modal.showModal();
}

function openAnswerModal({ post }) {
  const modal = $("answerModal");
  const bodyEl = $("answerBody");
  const msgEl = $("answerMsg");
  if (!modal || !bodyEl || !msgEl) return;
  modal.dataset.postId = post?.id || "";
  bodyEl.value = post?.adminAnswer?.body || "";
  setStatus(msgEl, "");
  modal.showModal();
}

async function boot() {
  wireTabs();

  const fb = ensureFirebase();
  const mission = fb ? await fetchCurrentMission(fb.db).catch(() => null) : null;

  let currentUser = null;
  let cachedPosts = [];
  let postsById = new Map();

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

  $("answerClose")?.addEventListener("click", () => $("answerModal")?.close());
  $("answerCancel")?.addEventListener("click", () => $("answerModal")?.close());

  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-action][data-post-id]");
    if (!btn) return;
    const action = btn.getAttribute("data-action") || "";
    const id = btn.getAttribute("data-post-id") || "";
    const post = postsById.get(id);
    if (!post) return;

    if (action === "react") {
      if (!fb) return;
      if (!currentUser) {
        toast("로그인 후 리액션을 누를 수 있어요.");
        window.location.href = "./login.html";
        return;
      }

      const admin = isAdmin(currentUser);
      const reactionKey = btn.getAttribute("data-reaction-key") || "";
      const reaction = REACTIONS.find((r) => r.key === reactionKey);
      if (!reaction) return;

      const reactRef = doc(fb.db, "posts", id, "reactions", reaction.key, "users", currentUser.uid);
      runTransaction(fb.db, async (tx) => {
        const snap = await tx.get(reactRef);
        if (!snap.exists()) {
          tx.set(reactRef, { count: 1, updatedAt: serverTimestamp() });
          return { delta: 1 };
        }
        const current = Number(snap.data()?.count || 0);
        if (!admin) throw new Error("ALREADY");
        tx.update(reactRef, { count: current + 1, updatedAt: serverTimestamp() });
        return { delta: 1 };
      })
        .then((r) => {
          // optimistic UI: cloud function will reconcile reactionCounts
          post.reactionCounts = post.reactionCounts || {};
          post.reactionCounts[reaction.key] = Number(post.reactionCounts?.[reaction.key] || 0) + (r?.delta || 1);
          cachedPosts = cachedPosts.map((p) => (p.id === post.id ? post : p));
          postsById.set(post.id, post);
          renderFeeds(cachedPosts, { currentUser });
        })
        .catch((err) => {
          if (String(err?.message || "").includes("ALREADY")) {
            toast("이미 이 리액션을 눌렀어요.");
            return;
          }
          console.error(err);
          toast("리액션 처리에 실패했어요. 잠시 후 다시 시도해줘.");
        });
      return;
    }

    if (action === "adminAnswer") {
      if (!currentUser || !isAdmin(currentUser)) return;
      openAnswerModal({ post });
      return;
    }

    if (action === "editQuestion") {
      if (!currentUser || !isOwner(post, currentUser)) return;
      openPostModal({ mode: "question", post });
      return;
    }
  });

  $("questionFilter")?.addEventListener("change", async () => {
    if (!fb) return;
    const posts = await fetchRecentPosts(fb.db).catch(() => []);
    cachedPosts = posts;
    postsById = new Map(posts.map((p) => [p.id, p]));
    renderFeeds(posts, { currentUser });
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

    const modalEl = $("postModal");
    const mode = modalEl?.dataset?.mode || "mission";
    const editId = modalEl?.dataset?.postId || "";
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
      // Edit (question only)
      if (editId) {
        const existing = postsById.get(editId);
        if (!existing) {
          setStatus(msgEl, "수정할 글을 찾지 못했어요. 새로고침 후 다시 시도해줘.", "error");
          return;
        }
        if (mode !== "question") {
          setStatus(msgEl, "현재는 질문 글만 수정할 수 있어요.", "error");
          return;
        }
        if (!isOwner(existing, currentUser)) {
          setStatus(msgEl, "본인 글만 수정할 수 있어요.", "error");
          return;
        }

        await updateDoc(doc(fb.db, "posts", editId), {
          title,
          body,
          tags,
          updatedAt: serverTimestamp(),
        });

        setStatus(msgEl, "수정 완료! 목록을 새로 불러올게.", "success");
        window.setTimeout(() => $("postModal")?.close(), 500);
        const posts = await fetchRecentPosts(fb.db).catch(() => []);
        cachedPosts = posts;
        postsById = new Map(posts.map((p) => [p.id, p]));
        renderFeeds(posts, { currentUser });
        return;
      }

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
    cachedPosts = posts;
    postsById = new Map(posts.map((p) => [p.id, p]));
    renderFeeds(posts, { currentUser });
  });

  const answerForm = $("answerForm");
  answerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!fb) return;
    const modal = $("answerModal");
    const msgEl = $("answerMsg");
    if (!modal || !msgEl) return;
    if (!currentUser || !isAdmin(currentUser)) {
      setStatus(msgEl, "관리자만 답변을 저장할 수 있어요.", "error");
      return;
    }

    const postId = modal.dataset.postId || "";
    const post = postsById.get(postId);
    if (!post || post.type !== "question") {
      setStatus(msgEl, "대상 질문을 찾지 못했어요. 새로고침 후 다시 시도해줘.", "error");
      return;
    }

    const body = String($("answerBody")?.value || "").trim();
    if (!body) {
      setStatus(msgEl, "답변 내용을 입력해줘.", "error");
      return;
    }

    setStatus(msgEl, "저장 중...", "info");
    try {
      await updateDoc(doc(fb.db, "posts", postId), {
        adminAnswer: {
          body,
          authorName: currentUser.displayName || currentUser.email || ADMIN_NAME,
          updatedAt: serverTimestamp(),
        },
        status: "solved",
        updatedAt: serverTimestamp(),
      });
      setStatus(msgEl, "저장 완료!", "success");
      window.setTimeout(() => $("answerModal")?.close(), 500);
    } catch (err) {
      console.error(err);
      setStatus(msgEl, `저장 실패: ${err?.message || "오류"}`, "error");
    }

    const posts = await fetchRecentPosts(fb.db).catch(() => []);
    cachedPosts = posts;
    postsById = new Map(posts.map((p) => [p.id, p]));
    renderFeeds(posts, { currentUser });
  });

  if (!fb) {
    renderMission(mission, null);
    renderFeeds([], { currentUser: null });
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
    cachedPosts = posts;
    postsById = new Map(posts.map((p) => [p.id, p]));
    renderFeeds(posts, { currentUser });
  });
}

document.addEventListener("DOMContentLoaded", boot);

