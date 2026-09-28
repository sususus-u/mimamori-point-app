// ハブから届く Firebase IDトークン(Authorization: Bearer <IDトークン>)を確かめ、利用者のuidを取り出す。
// firebase-admin/auth は本番で読み込みエラー(ERR_REQUIRE_ESM)を起こした前例があるため使わず、
// Node標準の crypto と、Googleが公開している証明書だけで検証する。
// 他の窓口を巻き込まないよう、この部品は dashboard-items からだけ読み込むこと。

import { createPublicKey, createVerify } from "node:crypto";

// ハブ(おきづきびより)と共用している Firebase プロジェクト。
export const HUB_FIREBASE_PROJECT_ID = "okizukibiyori";

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// 時計のずれを少しだけ許容する(秒)
const CLOCK_SKEW_SEC = 60;

type Certs = Record<string, string>;

let cachedCerts: Certs | null = null;
let cachedUntil = 0;

async function fetchGoogleCerts(): Promise<Certs> {
  if (cachedCerts && Date.now() < cachedUntil) return cachedCerts;

  const res = await fetch(GOOGLE_CERTS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`証明書の取得に失敗しました: ${res.status}`);
  const certs = (await res.json()) as Certs;

  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "");
  cachedCerts = certs;
  cachedUntil = Date.now() + (maxAge ? Number(maxAge[1]) : 3600) * 1000;
  return certs;
}

function decodeSegment(segment: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("不正なトークン");
  }
  return parsed as Record<string, unknown>;
}

// 証明書・プロジェクト・現在時刻を受け取って検証する本体。正しければuid、だめならnullを返す。
export function verifyIdTokenWithCerts(
  token: string,
  certs: Certs,
  projectId: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = decodeSegment(headerB64);
    const payload = decodeSegment(payloadB64);

    if (header.alg !== "RS256") return null;
    if (typeof header.kid !== "string") return null;
    const pem = certs[header.kid];
    if (!pem) return null;

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const signatureOk = verifier.verify(
      createPublicKey(pem),
      Buffer.from(signatureB64, "base64url")
    );
    if (!signatureOk) return null;

    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.exp !== "number" || payload.exp <= nowSec - CLOCK_SKEW_SEC) return null;
    if (typeof payload.iat !== "number" || payload.iat > nowSec + CLOCK_SKEW_SEC) return null;
    if (typeof payload.auth_time !== "number" || payload.auth_time > nowSec + CLOCK_SKEW_SEC) {
      return null;
    }
    if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

// Authorization ヘッダーの値からuidを取り出す。無い・確かめられない場合はnull。
export async function verifyBearerIdToken(authorization: string | null): Promise<string | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!match) return null;
  try {
    const certs = await fetchGoogleCerts();
    return verifyIdTokenWithCerts(match[1], certs, HUB_FIREBASE_PROJECT_ID);
  } catch (error) {
    console.error("verifyIdToken error", error);
    return null;
  }
}
