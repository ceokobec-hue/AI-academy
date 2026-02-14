import { firebaseConfig } from "./firebase-config.js";
import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

const ADMIN_EMAIL = "mentor0329@hanmail.net";

function isAdmin(user) {
  if (!user) return false;
  const email = (user.email || "").toLowerCase();
  return email === ADMIN_EMAIL.toLowerCase();
}

function qs(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[m] || m;
  });
}

function fmtDate(iso) {
  if (!iso) return "-";
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  if (!y || !m || !d) return iso;
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
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

function getUrlDate() {
  const sp = new URLSearchParams(location.search);
  const date = sp.get("date");
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

function getUrlRoom() {
  const sp = new URLSearchParams(location.search);
  const room = sp.get("room");
  if (!room) return null;
  if (room.length > 128) return null;
  return room;
}

function setNick(value) {
  localStorage.setItem("rb_nick", value || "");
}
function getNick() {
  return (localStorage.getItem("rb_nick") || "").trim();
}

function fileExt(file) {
  const name = file?.name || "";
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : "jpg";
}

function ensureFirebase() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  return { auth, db, storage };
}

async function uploadImage({ storage, path, file, progressEl }) {
  if (!file) return null;
  const r = ref(storage, path);
  return await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(r, file, { contentType: file.type || "image/jpeg" });
    task.on(
      "state_changed",
      (snap) => {
        if (!progressEl) return;
        const pct = snap.totalBytes ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
        progressEl.value = Math.max(0, Math.min(100, Math.round(pct)));
      },
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
}

function boardListItem(board) {
  const title = esc(board.title || "(제목 없음)");
  const date = esc(board.date || "");
  const openBadge =
    board.isOpen === false ? `<span class="badge">마감</span>` : `<span class="badge badge-good">진행중</span>`;
  return `
    <article class="post-card">
      <div class="post-head">
        <div>
          <p class="post-kicker">실시간 방 · ${fmtDate(date)} ${openBadge}</p>
          <h3 class="post-title"><a class="link" href="./realtimeboard.html?room=${esc(board.id)}">${title}</a></h3>
        </div>
      </div>
      <div class="post-meta">
        <span class="muted"><a class="link" href="./realtimeboard.html?date=${date}">${fmtDate(date)} 방만 보기</a></span>
      </div>
    </article>
  `.trim();
}

function postCard(post, { currentUser, admin }) {
  const typeLabel = post.type === "mission" ? "공지/미션" : "제출";
  const kicker = post.type === "mission" ? "badge badge-neutral" : "badge badge-good";
  const nick = post.type === "submit" ? `<span class="muted">· ${esc(post.nickname || "익명")}</span>` : "";
  const img = post.imageUrl
    ? `<div class="post-image"><img alt="" loading="lazy" decoding="async" src="${esc(post.imageUrl)}" /></div>`
    : "";

  const owner = !!currentUser && post.authorUid && currentUser.uid === post.authorUid;
  const canEdit = post.type === "submit" && owner;
  const canDelete = (post.type === "submit" && owner) || admin;

  const actions = (canEdit || canDelete)
    ? `
      <div class="post-actions">
        ${canEdit ? `<button class="btn btn-ghost" type="button" data-act="edit" data-id="${esc(post.id)}">수정</button>` : ""}
        ${canDelete ? `<button class="btn btn-ghost" type="button" data-act="del" data-id="${esc(post.id)}">삭제</button>` : ""}
      </div>
    `
    : "";

  return `
    <article class="post-card" data-id="${esc(post.id)}">
      <div class="post-head">
        <div>
          <p class="post-kicker"><span class="${kicker}">${typeLabel}</span> ${nick}</p>
          <h3 class="post-title">${esc(post.title || "(제목 없음)")}</h3>
        </div>
      </div>
      <p class="post-body">${esc(post.body || "")}</p>
      ${img}
      ${actions}
    </article>
  `.trim();
}

function emptyCard(html) {
  return `<div class="card empty-card">${html}</div>`;
}

let unsubscribePosts = null;

async function main() {
  const { auth, db, storage } = ensureFirebase();

  const boardListCard = qs("#boardListCard");
  const boardViewCard = qs("#boardViewCard");
  const boardList = qs("#boardList");
  const boardFeed = qs("#boardFeed");
  const boardTitle = qs("#boardTitle");
  const boardMeta = qs("#boardMeta");
  const boardListActions = qs("#boardListActions");
  const boardViewActions = qs("#boardViewActions");
  const boardListTitle = qs("#boardListTitle");
  const boardListBack = qs("#boardListBack");
  const nickInput = qs("#nickInput");

  const boardModal = qs("#boardModal");
  const boardForm = qs("#boardForm");
  const boardClose = qs("#boardClose");
  const boardCancel = qs("#boardCancel");
  const boardMsg = qs("#boardMsg");
  const boardDate = qs("#boardDate");
  const boardTitleInput = qs("#boardTitleInput");

  const postModal = qs("#rbPostModal");
  const postForm = qs("#rbPostForm");
  const postClose = qs("#rbPostClose");
  const postCancel = qs("#rbCancelBtn");
  const postModalTitle = qs("#rbPostTitle");
  const rbNickWrap = qs("#rbNickWrap");
  const rbNick = qs("#rbNick");
  const rbTitle = qs("#rbTitle");
  const rbBody = qs("#rbBody");
  const rbImage = qs("#rbImage");
  const rbImageProgress = qs("#rbImageProgress");
  const rbMsg = qs("#rbMsg");
  const rbSubmitBtn = qs("#rbSubmitBtn");

  nickInput.value = getNick();
  nickInput.addEventListener("input", () => setNick(nickInput.value.trim()));

  let currentUser = null;
  let admin = false;

  function openModal(dlg) {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }
  function closeModal(dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }

  boardClose.addEventListener("click", () => closeModal(boardModal));
  boardCancel.addEventListener("click", () => closeModal(boardModal));
  postClose.addEventListener("click", () => closeModal(postModal));
  postCancel.addEventListener("click", () => closeModal(postModal));

  function openPostModal({ mode, post }) {
    rbMsg.textContent = "";
    rbImage.value = "";
    rbImageProgress.value = 0;
    postForm.dataset.mode = mode; // submit | mission | edit
    postForm.dataset.postId = post?.id || "";

    if (mode === "mission") {
      postModalTitle.textContent = "공지/미션 올리기(관리자)";
      rbNickWrap.style.display = "none";
      rbNick.required = false;
      rbTitle.value = post?.title || "";
      rbBody.value = post?.body || "";
      rbSubmitBtn.textContent = post ? "수정하기" : "올리기";
    } else {
      const nick = (nickInput.value || getNick() || "").trim();
      postModalTitle.textContent = mode === "edit" ? "내 제출 수정" : "제출 올리기";
      rbNickWrap.style.display = "";
      rbNick.required = true;
      rbNick.value = post?.nickname || nick;
      rbTitle.value = post?.title || "";
      rbBody.value = post?.body || "";
      rbSubmitBtn.textContent = mode === "edit" ? "수정하기" : "올리기";
    }
    openModal(postModal);
  }

  function openBoardModal() {
    boardMsg.textContent = "";
    boardTitleInput.value = "";
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    boardDate.value = iso;
    openModal(boardModal);
  }

  function renderBoardListActions() {
    boardListActions.innerHTML = "";
    if (!admin) return;
    const btn = document.createElement("button");
    btn.className = "btn btn-primary";
    btn.type = "button";
    btn.textContent = "방 만들기";
    btn.addEventListener("click", openBoardModal);
    boardListActions.appendChild(btn);
  }

  function renderBoardViewActions({ board }) {
    boardViewActions.innerHTML = "";

    const submitBtn = document.createElement("button");
    submitBtn.className = "btn btn-primary";
    submitBtn.type = "button";
    submitBtn.textContent = "제출 올리기";
    submitBtn.disabled = board?.isOpen === false;
    submitBtn.addEventListener("click", () => openPostModal({ mode: "submit" }));
    boardViewActions.appendChild(submitBtn);

    if (!admin) return;

    const missionBtn = document.createElement("button");
    missionBtn.className = "btn btn-ghost";
    missionBtn.type = "button";
    missionBtn.textContent = "공지/미션 올리기";
    missionBtn.addEventListener("click", () => openPostModal({ mode: "mission" }));
    boardViewActions.appendChild(missionBtn);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn-ghost";
    toggleBtn.type = "button";
    toggleBtn.textContent = board?.isOpen === false ? "방 열기" : "방 마감";
    toggleBtn.addEventListener("click", async () => {
      if (!board?.id) return;
      try {
        await updateDoc(doc(db, "realtimeRooms", board.id), {
          isOpen: board.isOpen === false ? true : false,
          updatedAt: serverTimestamp(),
        });
        toast(board.isOpen === false ? "방을 열었습니다." : "방을 마감했습니다.");
      } catch (e) {
        console.error(e);
        toast("변경 실패(권한/네트워크).");
      }
    });
    boardViewActions.appendChild(toggleBtn);
  }

  async function loadBoardList() {
    boardList.innerHTML = emptyCard("불러오는 중...");
    try {
      const q = query(collection(db, "realtimeRooms"), orderBy("date", "desc"), limit(200));
      const snap = await getDocsFromServer(q).catch(() => getDocs(q));
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      if (!items.length) {
        boardList.innerHTML = emptyCard("아직 만들어진 방이 없습니다.");
        return;
      }
      const date = getUrlDate();
      const filtered = date ? items.filter((x) => x.date === date) : items;
      if (date) {
        boardListTitle.textContent = `${fmtDate(date)} 방`;
        boardListBack.style.display = "";
      } else {
        boardListTitle.textContent = "최근 방";
        boardListBack.style.display = "none";
      }
      if (!filtered.length) {
        boardList.innerHTML = emptyCard("해당 날짜에 만들어진 방이 없습니다.");
        return;
      }
      boardList.innerHTML = filtered.map(boardListItem).join("\n");
    } catch (e) {
      console.error(e);
      boardList.innerHTML = emptyCard("불러오기 실패(권한/네트워크).");
    }
  }

  function stopPostsSub() {
    if (typeof unsubscribePosts === "function") unsubscribePosts();
    unsubscribePosts = null;
  }

  async function openRoom(roomId) {
    stopPostsSub();

    boardListCard.style.display = "none";
    boardViewCard.style.display = "";

    boardFeed.innerHTML = emptyCard("불러오는 중...");

    const boardRef = doc(db, "realtimeRooms", roomId);
    const boardSnap = await getDoc(boardRef);
    if (!boardSnap.exists()) {
      boardTitle.textContent = "없는 방입니다.";
      boardMeta.textContent = `방이 없습니다.`;
      renderBoardViewActions({ board: { id: roomId, isOpen: false } });
      boardFeed.innerHTML = emptyCard("방이 존재하지 않습니다.");
      return;
    }
    const board = { id: boardSnap.id, ...boardSnap.data() };

    boardTitle.textContent = board.title || "(제목 없음)";
    boardMeta.textContent = `${fmtDate(board.date)} · ${board.isOpen === false ? "마감" : "진행중"}`;
    renderBoardViewActions({ board });

    const postsRef = collection(db, "realtimeRooms", roomId, "posts");
    const q = query(postsRef, orderBy("createdAt", "desc"), limit(200));

    unsubscribePosts = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            type: data.type || "submit",
            title: data.title || "",
            body: data.body || "",
            nickname: data.nickname || "",
            imageUrl: data.imageUrl || "",
            authorUid: data.author?.uid || data.authorUid || "",
          });
        });

        if (!list.length) {
          boardFeed.innerHTML = emptyCard("아직 글이 없습니다. 첫 제출을 올려보세요.");
          return;
        }

        boardFeed.innerHTML = list.map((p) => postCard(p, { currentUser, admin })).join("\n");
      },
      (err) => {
        console.error(err);
        boardFeed.innerHTML = emptyCard("실시간 불러오기 실패(권한/네트워크).");
      },
    );
  }

  function showList() {
    stopPostsSub();
    boardViewCard.style.display = "none";
    boardListCard.style.display = "";
  }

  // 이벤트 위임: 수정/삭제
  boardFeed.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (!act || !id) return;

    const roomId = getUrlRoom();
    if (!roomId) return;

    const refDoc = doc(db, "realtimeRooms", roomId, "posts", id);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) return toast("글이 없습니다.");
    const data = snap.data();
    const post = {
      id: snap.id,
      type: data.type || "submit",
      title: data.title || "",
      body: data.body || "",
      nickname: data.nickname || "",
      imageUrl: data.imageUrl || "",
      authorUid: data.author?.uid || data.authorUid || "",
    };

    if (act === "edit") {
      openPostModal({ mode: "edit", post });
      return;
    }

    if (act === "del") {
      const ok = confirm("정말 삭제할까요?");
      if (!ok) return;
      try {
        await deleteDoc(refDoc);
        toast("삭제했습니다.");
      } catch (err) {
        console.error(err);
        toast("삭제 실패(권한/네트워크).");
      }
    }
  });

  boardForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    boardMsg.textContent = "";
    if (!admin) {
      boardMsg.textContent = "관리자만 만들 수 있어요.";
      return;
    }
    const date = (boardDate.value || "").trim();
    const title = (boardTitleInput.value || "").trim();
    if (!date || !title) return;

    try {
      const ref = await addDoc(collection(db, "realtimeRooms"), {
        date,
        title,
        isOpen: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: { uid: currentUser?.uid || null, email: currentUser?.email || null },
      });
      closeModal(boardModal);
      toast("방을 만들었습니다.");
      history.pushState({}, "", `./realtimeboard.html?room=${ref.id}`);
      await openRoom(ref.id);
    } catch (err) {
      console.error(err);
      boardMsg.textContent = "실패: 권한/네트워크";
    }
  });

  postForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    rbMsg.textContent = "";
    rbSubmitBtn.disabled = true;
    rbImageProgress.value = 0;

    const mode = postForm.dataset.mode || "submit";
    const roomId = getUrlRoom();
    if (!roomId) {
      rbMsg.textContent = "방이 선택되지 않았습니다.";
      rbSubmitBtn.disabled = false;
      return;
    }

    try {
      const title = (rbTitle.value || "").trim();
      const body = (rbBody.value || "").trim();
      if (!title || !body) throw new Error("제목/내용이 필요합니다.");

      const imageFile = rbImage.files?.[0] || null;

      if (mode === "mission") {
        if (!admin) throw new Error("관리자만 공지를 올릴 수 있어요.");
        const ref = await addDoc(collection(db, "realtimeRooms", roomId, "posts"), {
          type: "mission",
          title,
          body,
          imageUrl: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          author: { uid: currentUser?.uid || null, email: currentUser?.email || null },
        });

        if (imageFile) {
          const url = await uploadImage({
            storage,
            path: `realtimeboards/${roomId}/posts/${ref.id}.${fileExt(imageFile)}`,
            file: imageFile,
            progressEl: rbImageProgress,
          });
          await updateDoc(doc(db, "realtimeRooms", roomId, "posts", ref.id), {
            imageUrl: url || "",
            updatedAt: serverTimestamp(),
          });
        }

        closeModal(postModal);
        toast("공지/미션을 올렸습니다.");
        return;
      }

      // submit / edit
      const nickname = (rbNick.value || "").trim();
      if (!nickname) throw new Error("별명을 입력해 주세요.");
      setNick(nickname);
      nickInput.value = nickname;

      if (mode === "edit") {
        const postId = postForm.dataset.postId;
        if (!postId) throw new Error("수정 대상이 없습니다.");

        await updateDoc(doc(db, "realtimeRooms", roomId, "posts", postId), {
          title,
          body,
          nickname,
          updatedAt: serverTimestamp(),
        });

        if (imageFile) {
          const url = await uploadImage({
            storage,
            path: `realtimeboards/${roomId}/posts/${postId}.${fileExt(imageFile)}`,
            file: imageFile,
            progressEl: rbImageProgress,
          });
          await updateDoc(doc(db, "realtimeRooms", roomId, "posts", postId), {
            imageUrl: url || "",
            updatedAt: serverTimestamp(),
          });
        }

        closeModal(postModal);
        toast("수정했습니다.");
        return;
      }

      // create submit
      const ref = await addDoc(collection(db, "realtimeRooms", roomId, "posts"), {
        type: "submit",
        title,
        body,
        nickname,
        imageUrl: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        author: { uid: currentUser.uid, isAnonymous: !!currentUser.isAnonymous },
      });

      if (imageFile) {
        const url = await uploadImage({
          storage,
          path: `realtimeboards/${roomId}/posts/${ref.id}.${fileExt(imageFile)}`,
          file: imageFile,
          progressEl: rbImageProgress,
        });
        await updateDoc(doc(db, "realtimeRooms", roomId, "posts", ref.id), {
          imageUrl: url || "",
          updatedAt: serverTimestamp(),
        });
      }

      closeModal(postModal);
      toast("제출을 올렸습니다.");
    } catch (err) {
      console.error(err);
      rbMsg.textContent = err?.message || "실패: 권한/네트워크";
    } finally {
      rbSubmitBtn.disabled = false;
    }
  });

  onAuthStateChanged(auth, async (u) => {
    currentUser = u;
    admin = isAdmin(u);
    renderBoardListActions();

    if (!currentUser) {
      try {
        await signInAnonymously(auth);
        return;
      } catch (e) {
        console.error(e);
        toast("익명 로그인 실패: Firebase 콘솔에서 익명 로그인을 켜야 합니다.");
        // 계속 진행은 하되, 쓰기 동작은 막힐 수 있음
      }
    }

    const roomId = getUrlRoom();
    const date = getUrlDate();
    if (roomId) {
      await openRoom(roomId);
      return;
    }
    showList();
    await loadBoardList();
  });

  // URL에서 date가 바뀌는 경우 대응(뒤로/앞으로)
  window.addEventListener("popstate", async () => {
    const roomId = getUrlRoom();
    if (roomId) {
      await openRoom(roomId);
      return;
    }
    showList();
    await loadBoardList();
  });
}

main().catch((e) => {
  console.error(e);
  toast("초기화 실패(콘솔 확인).");
});

