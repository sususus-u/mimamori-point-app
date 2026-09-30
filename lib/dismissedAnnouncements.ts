"use client";

// 「運営からのお知らせ」のうち、利用者が自分の画面から消したもののID一覧。
// サーバー側のお知らせそのものは変えず、この端末(ブラウザ)のlocalStorageにだけ
// 記録する。消したものは一覧とベルの新着ドットの対象から外すが、
// 「過去のお知らせ」画面では引き続き表示する。
// 元に戻す操作は用意しない(追加のみ)。

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tamari:dismissed_announcements";
// 同じタブ内の他のコンポーネント(AppShellのベルなど)へ変更を知らせるためのイベント名。
// 別タブへの反映はブラウザ標準の storage イベントで受け取る。
const CHANGE_EVENT = "tamari:dismissed-announcements-change";

const EMPTY: readonly string[] = [];
let cachedRaw: string | null = null;
let cachedIds: readonly string[] = EMPTY;

function readIds(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // プライベートモードなどで読めない場合は、何も消していない扱いにする。
    return EMPTY;
  }
  // useSyncExternalStoreは毎回同じ参照を返す必要があるため、
  // 中身が変わった時だけ配列を作り直す。
  if (raw === cachedRaw) return cachedIds;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedIds = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : EMPTY;
  } catch {
    cachedIds = EMPTY;
  }
  return cachedIds;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function dismissAnnouncements(ids: string[]): void {
  const next = [...new Set([...readIds(), ...ids])];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できない環境では、何もしない(一覧から消えないだけで、他に影響はない)。
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// 消したお知らせのID一覧。サーバー描画時は空として扱う。
export function useDismissedAnnouncementIds(): readonly string[] {
  return useSyncExternalStore(subscribe, readIds, () => EMPTY);
}
