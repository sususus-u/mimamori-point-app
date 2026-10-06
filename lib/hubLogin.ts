// ハブ(okizukibiyori.com)のログイン画面へ移動するための部品。
//
// ログイン画面: https://okizukibiyori.com/login?return=<元のURL>
// ログイン後、ハブは return のURLに ?authToken= を付けて戻す。
// return には ?authToken= を含めない(含めるとハブ側で許可されない)。

const HUB_LOGIN_URL = "https://okizukibiyori.com/login";

// 1回の起動(タブ)でハブへ移動した回数。sessionStorage はタブごとに別なので、
// 「1回の起動」を数えるのに合う。ログインが通らず戻ってきても無限に往復しないための歯止め。
const REDIRECT_COUNT_KEY = "tamari:hubLoginRedirects";
const MAX_REDIRECTS_PER_SESSION = 1;

/** return に入れる今のURL。authToken は必ず外す */
export function buildHubLoginUrl(currentHref: string): string {
  const back = new URL(currentHref);
  back.searchParams.delete("authToken");
  return `${HUB_LOGIN_URL}?return=${encodeURIComponent(back.toString())}`;
}

function readCount(): number {
  const raw = window.sessionStorage.getItem(REDIRECT_COUNT_KEY);
  const n = raw === null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ハブのログイン画面へ移動する。移動したら true。
 * すでに上限まで移動していた場合(や sessionStorage が使えず数えられない場合)は、
 * 移動せず false を返す。数えられないまま移動すると無限ループを防げないため。
 */
export function goToHubLogin(): boolean {
  try {
    const count = readCount();
    if (count >= MAX_REDIRECTS_PER_SESSION) return false;
    window.sessionStorage.setItem(REDIRECT_COUNT_KEY, String(count + 1));
  } catch {
    return false;
  }
  window.location.assign(buildHubLoginUrl(window.location.href));
  return true;
}

/** ログインできたとき、次の機会(ログアウト後など)のために数えを戻す */
export function resetHubLoginCount(): void {
  try {
    window.sessionStorage.removeItem(REDIRECT_COUNT_KEY);
  } catch {
    // 使えなくても、ログインには影響しない
  }
}
