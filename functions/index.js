const admin = require("firebase-admin");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const REGION = "asia-northeast3";

// Stripe 키는 Secret Manager로 관리합니다. (Functions v2에서 functions.config() 사용 불가)
// 설정:
// - npx firebase functions:secrets:set STRIPE_SECRET_KEY
// - npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

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

// ─── Stripe 결제 ──────────────────────────────────────────────

// 구독 고정 가격(원)
const SUB_MONTHLY = 99000;
const SUB_YEARLY = 890000;

/**
 * createCheckoutSession (callable)
 * 클라이언트에서 { plan, courseId } 를 보내면
 * Stripe Checkout Session URL을 만들어 돌려줍니다.
 *
 * plan 종류: "single30" | "single90" | "category30" | "category90" | "sub_monthly" | "sub_yearly"
 */
exports.createCheckoutSession = onCall(
  { region: REGION, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    if (req.auth.token?.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("failed-precondition", "익명 로그인으로는 결제할 수 없습니다.");
    }

    const uid = req.auth.uid;
    const { plan, courseId } = req.data || {};
    if (!plan) throw new HttpsError("invalid-argument", "plan이 필요합니다.");

    const db = admin.firestore();
    const stripe = require("stripe")(STRIPE_SECRET_KEY.value());

    let amount = 0;
    let description = "";
    let mode = "payment"; // one-time 결제
    let priceId = null; // 구독은 Stripe Price ID 사용
    let durationDays = 30;
    let planType = plan; // 메타데이터에 저장
    let targetCourseId = courseId || "";
    let targetCategoryId = "";

    if (plan.startsWith("single") || plan.startsWith("category")) {
      // 단품/카테고리: 강의 문서에서 pricing 읽기
      if (!courseId) throw new HttpsError("invalid-argument", "courseId가 필요합니다.");
      const courseSnap = await db.doc(`courses/${courseId}`).get();
      if (!courseSnap.exists) throw new HttpsError("not-found", "강의를 찾을 수 없습니다.");
      const course = courseSnap.data();
      const pricing = course.pricing || {};

      if (plan === "single30") {
        amount = Number(pricing.single30 || course.priceKrw || 0);
        durationDays = 30;
        description = `[단품 30일] ${course.title || courseId}`;
      } else if (plan === "single90") {
        amount = Number(pricing.single90 || 0);
        durationDays = 90;
        description = `[단품 90일] ${course.title || courseId}`;
      } else if (plan === "category30") {
        amount = Number(pricing.category30 || 0);
        durationDays = 30;
        targetCategoryId = course.categoryId || "";
        description = `[카테고리 30일] ${course.categoryId || "전체"}`;
      } else if (plan === "category90") {
        amount = Number(pricing.category90 || 0);
        durationDays = 90;
        targetCategoryId = course.categoryId || "";
        description = `[카테고리 90일] ${course.categoryId || "전체"}`;
      }

      if (!amount || amount <= 0) throw new HttpsError("failed-precondition", "가격이 설정되지 않았습니다.");
    } else if (plan === "sub_monthly") {
      amount = SUB_MONTHLY;
      description = "월 구독 (전체 강의)";
      mode = "subscription";
    } else if (plan === "sub_yearly") {
      amount = SUB_YEARLY;
      description = "연 구독 (전체 강의)";
      mode = "subscription";
    } else {
      throw new HttpsError("invalid-argument", "알 수 없는 plan입니다.");
    }

    // Stripe Checkout Session 파라미터 생성
    const baseUrl = req.rawRequest?.headers?.origin || "https://aiacademy-36b79.web.app";
    const successUrl = `${baseUrl}/lesson.html?id=${targetCourseId}&payment=success`;
    const cancelUrl = `${baseUrl}/lesson.html?id=${targetCourseId}&payment=cancel`;

    const metadata = {
      uid,
      plan: planType,
      courseId: targetCourseId,
      categoryId: targetCategoryId,
      durationDays: String(durationDays),
    };

    let sessionParams;
    if (mode === "subscription") {
      // 구독: Stripe Price를 동적 생성(ad-hoc price)
      sessionParams = {
        mode: "subscription",
        customer_email: req.auth.token?.email || undefined,
        line_items: [
          {
            price_data: {
              currency: "krw",
              product_data: { name: description },
              unit_amount: amount, // KRW는 소수점 없음
              recurring: {
                interval: plan === "sub_yearly" ? "year" : "month",
              },
            },
            quantity: 1,
          },
        ],
        subscription_data: { metadata },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
      };
    } else {
      // 단건 결제
      sessionParams = {
        mode: "payment",
        customer_email: req.auth.token?.email || undefined,
        line_items: [
          {
            price_data: {
              currency: "krw",
              product_data: { name: description },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: { metadata },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return { url: session.url };
  },
);

/**
 * stripeWebhook (HTTP endpoint)
 * Stripe에서 결제 완료(checkout.session.completed) 이벤트를 보내면
 * users/{uid}/enrollments/{courseId} 문서를 생성해 수강 권한을 부여합니다.
 */
exports.stripeWebhook = onRequest(
  {
    region: REGION,
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
    // Stripe webhook은 raw body가 필요
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const stripe = require("stripe")(STRIPE_SECRET_KEY.value());
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value(),
      );
    } catch (err) {
      console.error("Webhook signature verification failed.", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    const db = admin.firestore();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const meta = session.metadata || {};
      const uid = meta.uid;
      const plan = meta.plan;
      const courseId = meta.courseId;
      const categoryId = meta.categoryId;
      const durationDays = Number(meta.durationDays || 30);

      if (!uid) {
        console.error("No uid in metadata", meta);
        res.status(200).send("OK (no uid)");
        return;
      }

      const now = admin.firestore.Timestamp.now();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + durationDays * 24 * 60 * 60 * 1000,
      );

      if (plan === "sub_monthly" || plan === "sub_yearly") {
        // 구독: 전체 강의 오픈 → users/{uid}.entitlements.subscriptionActive = true
        await db.doc(`users/${uid}`).set(
          {
            entitlements: {
              subscriptionActive: true,
              subscriptionPlan: plan,
              subscriptionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
              subscriptionExpiresAt: expiresAt,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        console.log(`Subscription activated: uid=${uid}, plan=${plan}`);
      } else if (plan === "category30" || plan === "category90") {
        // 카테고리: entitlements.categoryPass.{categoryId} = { expiresAt, ... } 로 1회 저장
        if (categoryId) {
          await db.doc(`users/${uid}`).set(
            {
              entitlements: {
                categoryPass: {
                  [categoryId]: {
                    expiresAt,
                    plan,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    stripeSessionId: session.id,
                  },
                },
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          console.log(`Category pass activated: uid=${uid}, category=${categoryId}, plan=${plan}`);
        }
      } else if (plan === "single30" || plan === "single90") {
        // 단품: 해당 강의만 enrollment
        if (courseId) {
          await db.doc(`users/${uid}/enrollments/${courseId}`).set(
            {
              enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
              expiresAt,
              plan,
              stripeSessionId: session.id,
            },
            { merge: true },
          );
          console.log(`Single enrollment: uid=${uid}, courseId=${courseId}, plan=${plan}`);
        }
      }

      // 결제 기록 저장
      await db.collection("payments").add({
        uid,
        plan,
        courseId: courseId || null,
        categoryId: categoryId || null,
        amount: session.amount_total,
        currency: session.currency,
        stripeSessionId: session.id,
        stripePaymentIntent: session.payment_intent || null,
        stripeSubscription: session.subscription || null,
        status: session.payment_status,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.status(200).json({ received: true });
  },
);

