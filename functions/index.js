const admin = require("firebase-admin");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();

const REGION = "asia-northeast3";

function normalizeCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function incLikeCount(postId, delta) {
  if (!delta || delta <= 0) return null;
  const ref = admin.firestore().doc(`posts/${postId}`);
  return ref.set(
    {
      likeCount: admin.firestore.FieldValue.increment(delta),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

exports.likeOnCreate = onDocumentCreated(
  { document: "posts/{postId}/likes/{uid}", region: REGION },
  async (event) => {
  const postId = event.params.postId;
  const data = event.data?.data?.() || {};
  const count = Number(data.count || 1);
  return incLikeCount(postId, count);
  },
);

exports.likeOnUpdate = onDocumentUpdated(
  { document: "posts/{postId}/likes/{uid}", region: REGION },
  async (event) => {
  const postId = event.params.postId;
  const before = event.data?.before?.data?.() || {};
  const after = event.data?.after?.data?.() || {};
  const delta = Number(after.count || 0) - Number(before.count || 0);
  return incLikeCount(postId, delta);
  },
);

function incReactionCount(postId, reactionKey, delta) {
  if (!reactionKey) return null;
  if (!delta || delta <= 0) return null;
  const ref = admin.firestore().doc(`posts/${postId}`);
  return ref.set(
    {
      [`reactionCounts.${reactionKey}`]: admin.firestore.FieldValue.increment(delta),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

exports.reactionOnCreate = onDocumentCreated(
  { document: "posts/{postId}/reactions/{reactionKey}/users/{uid}", region: REGION },
  async (event) => {
    const { postId, reactionKey, uid } = event.params;
    const data = event.data?.data?.() || {};
    const count = Number(data.count || 1);
    console.log("reactionOnCreate", { postId, reactionKey, uid, count });
    try {
      await incReactionCount(postId, reactionKey, count);
      console.log("reactionOnCreate ok", { postId, reactionKey, delta: count });
    } catch (e) {
      console.error("reactionOnCreate failed", { postId, reactionKey, uid, err: String(e?.message || e) });
      throw e;
    }
  },
);

exports.reactionOnUpdate = onDocumentUpdated(
  { document: "posts/{postId}/reactions/{reactionKey}/users/{uid}", region: REGION },
  async (event) => {
    const { postId, reactionKey, uid } = event.params;
    const before = event.data?.before?.data?.() || {};
    const after = event.data?.after?.data?.() || {};
    const delta = Number(after.count || 0) - Number(before.count || 0);
    console.log("reactionOnUpdate", {
      postId,
      reactionKey,
      uid,
      before: Number(before.count || 0),
      after: Number(after.count || 0),
      delta,
    });
    try {
      await incReactionCount(postId, reactionKey, delta);
      console.log("reactionOnUpdate ok", { postId, reactionKey, delta });
    } catch (e) {
      console.error("reactionOnUpdate failed", { postId, reactionKey, uid, err: String(e?.message || e) });
      throw e;
    }
  },
);

// 초대코드 등록(현장 강의 참여자)
// - inviteCodes/{CODE} 문서가 존재하고 enabled=true면, users/{uid}.entitlements.inviteVerified=true로 세팅
// - 코드는 클라이언트에서 읽을 수 없게(룰) 하고, 서버 함수로만 검증/발급
exports.redeemInviteCode = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  if (req.auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("failed-precondition", "익명 로그인 계정은 초대코드 등록이 불가능합니다.");
  }

  const uid = req.auth.uid;
  const code = normalizeCode(req.data?.code);
  if (!code || code.length < 4 || code.length > 64) {
    throw new HttpsError("invalid-argument", "초대코드가 올바르지 않습니다.");
  }

  // 기본 제공 초대코드: DB에 없어도 항상 사용 가능
  const DEFAULT_CODE = "AIACADEMY-FREE";
  const isDefaultCode = code === DEFAULT_CODE;

  const db = admin.firestore();
  const codeRef = db.doc(`inviteCodes/${code}`);
  const useRef = db.doc(`inviteCodes/${code}/uses/${uid}`);
  const userRef = db.doc(`users/${uid}`);

  const result = await db.runTransaction(async (tx) => {
    const [codeSnap, useSnap, userSnap] = await Promise.all([tx.get(codeRef), tx.get(useRef), tx.get(userRef)]);

    if (!codeSnap.exists && !isDefaultCode) throw new HttpsError("not-found", "초대코드를 찾을 수 없습니다.");
    const codeData = codeSnap.exists ? (codeSnap.data() || {}) : { enabled: true };
    if (!isDefaultCode && codeData.enabled === false) {
      throw new HttpsError("permission-denied", "비활성화된 초대코드입니다.");
    }

    const ent = (userSnap.exists ? userSnap.data()?.entitlements : null) || {};
    if (ent.inviteVerified === true) {
      return { alreadyVerified: true };
    }

    // 기본 제공 코드는 문서가 없으면 만들어 둬서(운영 편의) 사용 카운트도 남김
    if (isDefaultCode && !codeSnap.exists) {
      tx.set(
        codeRef,
        {
          enabled: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          note: "기본 제공 초대코드(홍보용)",
          usedCount: 0,
        },
        { merge: true },
      );
    }

    // 이미 이 코드로 등록을 시도한 적이 있으면, 중복 카운트 방지
    if (useSnap.exists) {
      tx.set(
        userRef,
        {
          entitlements: {
            inviteVerified: true,
            inviteCode: code,
            inviteVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { alreadyVerified: false, ok: true };
    }

    // maxUses / expiresAt 같은 정책이 필요하면 여기서 확장 가능
    tx.set(useRef, { uid, usedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    tx.set(
      codeRef,
      {
        usedCount: admin.firestore.FieldValue.increment(1),
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      userRef,
      {
        entitlements: {
          inviteVerified: true,
          inviteCode: code,
          inviteVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { alreadyVerified: false, ok: true };
  });

  return result;
});

