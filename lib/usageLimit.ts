// AI読み取り(スクショ読み取り・現物の写真読み取り)の1日あたりの利用回数を、
// アカウント(uid)ごとにサーバー側で数える(サーバー側専用)。
// 記録場所: usage_counts_tamari/{uid}_{日本時間の日付}
//   { uid, date, ai_read_count, updated_at, expireAt }
// このアプリは、まもりびより(usage_counts_mamori)・たべびより(usage_counts_tabe)と
// 同じFirebaseプロジェクト(okizukibiyori)を使うため、コレクション名をアプリ専用にしている。
// 数えるのはAdmin SDKを使うこの処理だけで、画面からは誰も書き込めない。

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyBearerIdToken } from "@/lib/verifyIdToken";

// 1アカウントが1日に使える、AI読み取りの回数(スクショ・現物の写真の合計)。
// 仮の数字。変更するときはここだけを書き換える。
export const DAILY_AI_READ_LIMIT = 20;

const COLLECTION = "usage_counts_tamari";
// 古い記録はFirestoreのTTL(expireAtフィールド)で消せるよう、期限を入れておく。
const RETENTION_DAYS = 7;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 日本時間の深夜0時で日付が切り替わるようにする。
function jstDateString(now = Date.now()): string {
  return new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// 今日の回数が上限未満なら1つ増やし、その1回分を戻すための関数を返す。
// 上限に達していれば何もせずnullを返す。
// 確認と加算を1つのトランザクションで行うため、同じ利用者から同時に何度呼ばれても
// 上限を超えない(サーバー側SDKのトランザクションは読んだドキュメントをロックする)。
// Firestoreに問い合わせられない場合は例外を投げる。
async function consumeAiRead(uid: string): Promise<(() => Promise<void>) | null> {
  const date = jstDateString();
  const ref = adminDb.collection(COLLECTION).doc(`${uid}_${date}`);
  const allowed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const value: unknown = snap.exists ? snap.get("ai_read_count") : 0;
    const current = typeof value === "number" && Number.isInteger(value) ? value : 0;
    if (current >= DAILY_AI_READ_LIMIT) return false;
    tx.set(
      ref,
      {
        uid,
        date,
        ai_read_count: current + 1,
        updated_at: Timestamp.now(),
        expireAt: Timestamp.fromMillis(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
      },
      { merge: true },
    );
    return true;
  });
  if (!allowed) return null;
  // AI側のエラーで結果を返せなかった分を1回戻す。加算したのと同じ日付の記録を減らす
  // (途中で日付をまたいでも翌日分を減らさない)。上限の確認は要らないので
  // トランザクションは使わない。戻す処理自体の失敗は記録だけして、例外は投げない。
  return async function refund() {
    try {
      await ref.update({ ai_read_count: FieldValue.increment(-1), updated_at: Timestamp.now() });
    } catch (error) {
      console.error("usage refund error", error);
    }
  };
}

export const AI_READ_LIMIT_MESSAGE =
  "本日のAI読み取りの回数上限に達しました。明日また、お試しいただくか、手入力してください。";

type GuardResult =
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; response: NextResponse };

// AIを呼ぶ窓口の入口で使う共通の関所。
// 利用者を確かめ(できなければ401)、回数を1つ使う(上限なら429、数えられなければ503)。
// Firestoreに問い合わせられない場合も、上限を確かめられないままAIを呼ぶことはしない。
export async function guardAiRead(authorization: string | null): Promise<GuardResult> {
  const uid = await verifyBearerIdToken(authorization);
  if (!uid) {
    return {
      ok: false,
      response: NextResponse.json({ error: "ログインを確認できませんでした" }, { status: 401 }),
    };
  }
  let refund: (() => Promise<void>) | null;
  try {
    refund = await consumeAiRead(uid);
  } catch (error) {
    console.error("usage count error", error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "ただいま読み取りを受け付けられません。時間をおいて再度お試しください。" },
        { status: 503 },
      ),
    };
  }
  if (!refund) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: AI_READ_LIMIT_MESSAGE, code: "daily_limit", limit: DAILY_AI_READ_LIMIT },
        { status: 429 },
      ),
    };
  }
  return { ok: true, refund };
}
