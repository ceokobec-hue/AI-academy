const admin = require("firebase-admin");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const REGION = "asia-northeast3";

// PayPal 키 (Sandbox/Live 모두 Secret Manager로 관리)
// 설정:
// - npx firebase functions:secrets:set PAYPAL_CLIENT_ID
// - npx firebase functions:secrets:set PAYPAL_SECRET
const PAYPAL_CLIENT_ID = defineSecret("PAYPAL_CLIENT_ID");
const PAYPAL_SECRET = defineSecret("PAYPAL_SECRET");

// PayPal 환경: sandbox / live (MVP는 sandbox로 시작)
const PAYPAL_ENV = "sandbox";

// PayPal은 KRW를 지원하지 않음 → USD로 변환 (1 USD ≈ 1350 KRW, 필요시 조정)
const KRW_TO_USD_RATE = 1350;

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

// ─── PayPal 헬퍼 ──────────────────────────────────────────────
function getPayPalClient() {
  const paypal = require("@paypal/checkout-server-sdk");
  const clientId = PAYPAL_CLIENT_ID.value();
  const clientSecret = PAYPAL_SECRET.value();
  
  const environment = PAYPAL_ENV === "live"
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);
  
  return new paypal.core.PayPalHttpClient(environment);
}

/**
 * createPayPalOrder (callable)
 * 클라이언트에서 { plan, courseId } 를 보내면
 * PayPal Order를 생성하고 approveUrl을 반환합니다.
 *
 * plan 종류: "single30" | "single90" | "category30" | "category90"
 */
exports.createPayPalOrder = onCall(
  { region: REGION, secrets: [PAYPAL_CLIENT_ID, PAYPAL_SECRET] },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    if (req.auth.token?.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("failed-precondition", "익명 로그인으로는 결제할 수 없습니다.");
    }

    const uid = req.auth.uid;
    const { plan, courseId } = req.data || {};
    if (!plan) throw new HttpsError("invalid-argument", "plan이 필요합니다.");

    const db = admin.firestore();

    let amount = 0;
    let description = "";
    let durationDays = 30;
    let planType = plan;
    let targetCourseId = courseId || "";
    let targetCategoryId = "";

    if (plan.startsWith("single") || plan.startsWith("category")) {
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
    } else {
      throw new HttpsError("invalid-argument", "알 수 없는 plan입니다.");
    }

    const baseUrl = req.rawRequest?.headers?.origin || "https://aiacademy-36b79.web.app";
    const returnUrl = `${baseUrl}/lesson.html?id=${targetCourseId}&paypal=return`;
    const cancelUrl = `${baseUrl}/lesson.html?id=${targetCourseId}&paypal=cancel`;

    const paypal = require("@paypal/checkout-server-sdk");
    const client = getPayPalClient();

    // PayPal은 KRW 미지원 → USD로 변환 (소수 2자리)
    const amountUsd = Math.max(0.01, Math.round((amount / KRW_TO_USD_RATE) * 100) / 100);

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          description: `${description} (${amount.toLocaleString()}원)`,
          amount: {
            currency_code: "USD",
            value: String(amountUsd.toFixed(2)),
          },
          custom_id: uid,
        },
      ],
      application_context: {
        brand_name: "김지백 AI경영아카데미",
        locale: "ko-KR",
        landing_page: "BILLING",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    });

    try {
      const response = await client.execute(request);
      const orderId = response.result.id;
      const approveLink = response.result.links.find((link) => link.rel === "approve");
      const approveUrl = approveLink?.href || "";

      if (!approveUrl) throw new Error("PayPal approve URL을 받지 못했습니다.");

      // 결제 기록 선기록 (멱등성/추적용, 원래 원화 금액 보존)
      await db.collection("payments").doc(orderId).set({
        provider: "paypal",
        paypalOrderId: orderId,
        uid,
        plan: planType,
        courseId: targetCourseId || null,
        categoryId: targetCategoryId || null,
        amount,
        amountKrw: amount,
        currency: "USD",
        amountUsd,
        durationDays,
        status: "created",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`PayPal order created: orderId=${orderId}, uid=${uid}, plan=${plan}`);
      return { orderId, approveUrl };
    } catch (err) {
      console.error("PayPal order creation failed:", err);
      throw new HttpsError("internal", `PayPal 주문 생성 실패: ${err.message || err}`);
    }
  },
);

/**
 * capturePayPalOrder (callable)
 * 사용자가 승인 완료 후 프론트에서 orderId를 보내면
 * PayPal capture를 실행하고 권한을 부여합니다.
 */
exports.capturePayPalOrder = onCall(
  { region: REGION, secrets: [PAYPAL_CLIENT_ID, PAYPAL_SECRET] },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

    const uid = req.auth.uid;
    const { orderId } = req.data || {};
    if (!orderId) throw new HttpsError("invalid-argument", "orderId가 필요합니다.");

    const db = admin.firestore();
    const paymentRef = db.collection("payments").doc(orderId);
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      throw new HttpsError("not-found", "결제 기록을 찾을 수 없습니다.");
    }

    const payment = paymentSnap.data();
    if (payment.uid !== uid) {
      throw new HttpsError("permission-denied", "본인 결제만 처리할 수 있습니다.");
    }

    // 이미 처리된 경우 재처리 방지(멱등)
    if (payment.status === "captured") {
      console.log(`Order already captured: orderId=${orderId}`);
      return { alreadyCaptured: true };
    }

    const paypal = require("@paypal/checkout-server-sdk");
    const client = getPayPalClient();
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    try {
      const response = await client.execute(request);
      const captureData = response.result;
      
      if (captureData.status !== "COMPLETED") {
        throw new Error(`PayPal capture 상태가 COMPLETED가 아닙니다: ${captureData.status}`);
      }

      const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id || "";
      const capturedAmount = Number(captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || 0);

      // 권한 부여(기존 Stripe webhook 로직 재사용)
      const plan = payment.plan;
      const courseId = payment.courseId;
      const categoryId = payment.categoryId;
      const durationDays = Number(payment.durationDays || 30);

      const now = admin.firestore.Timestamp.now();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + durationDays * 24 * 60 * 60 * 1000,
      );

      if (plan === "category30" || plan === "category90") {
        if (categoryId) {
          await db.doc(`users/${uid}`).set(
            {
              entitlements: {
                categoryPass: {
                  [categoryId]: {
                    expiresAt,
                    plan,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    paypalOrderId: orderId,
                    paypalCaptureId: captureId,
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
        if (courseId) {
          await db.doc(`users/${uid}/enrollments/${courseId}`).set(
            {
              enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
              expiresAt,
              plan,
              paypalOrderId: orderId,
              paypalCaptureId: captureId,
            },
            { merge: true },
          );
          console.log(`Single enrollment: uid=${uid}, courseId=${courseId}, plan=${plan}`);
        }
      }

      // 결제 기록 업데이트
      await paymentRef.set(
        {
          status: "captured",
          paypalCaptureId: captureId,
          capturedAmount,
          capturedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      console.log(`PayPal order captured: orderId=${orderId}, captureId=${captureId}, uid=${uid}`);
      return { success: true, captureId };
    } catch (err) {
      console.error("PayPal capture failed:", err);
      
      // 실패 상태로 기록
      await paymentRef.set(
        {
          status: "failed",
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          failureReason: String(err.message || err),
        },
        { merge: true },
      );

      throw new HttpsError("internal", `결제 처리 실패: ${err.message || err}`);
    }
  },
);

