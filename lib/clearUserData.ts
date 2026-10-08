// ログアウトのとき、この端末に残るユーザー固有のデータ(このアプリのキー)を消す。
// 使えない環境(プライベートモードなど)でも、ログアウト自体は止めない。
// hubLogin.ts の往復の数え(tamari:hubLoginRedirects)は、ログインの無限往復を防ぐ印で
// ユーザーのデータではないため、消さない。

const LOCAL_STORAGE_KEYS = ["tamari:dismissed_announcements"];

const SESSION_STORAGE_KEYS = [
  "account-list-tab",
  "scan-prefill-queue",
  "scan-prefill-history",
  "physical-scan-pending-image",
  "quick-update-pending-scan",
];

export function clearUserLocalData(): void {
  for (const key of LOCAL_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 使えなくても続ける
    }
  }
  for (const key of SESSION_STORAGE_KEYS) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // 使えなくても続ける
    }
  }
}
