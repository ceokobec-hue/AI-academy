const admin = require("firebase-admin");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");

admin.initializeApp();

const REGION = "asia-northeast3";

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

