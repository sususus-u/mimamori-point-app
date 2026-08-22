/**
 * ポイント・電子マネー期限管理アプリ
 * Firestore データモデル型定義
 *
 * 構想メモ(2026年8月時点)の仕様を反映
 * - コレクション構成: users / accounts / accounts/{id}/updates / outcome_events
 */

import type { Timestamp } from "firebase/firestore";

// ---------------------------------------------------------------------------
// 共通の型
// ---------------------------------------------------------------------------

/** 口座の種類プリセット */
export type AccountCategory =
  | "electronic_money" // 電子マネー
  | "points" // ポイント
  | "gift_certificate" // 商品券・ギフトカード(切手もここに含める。有効期限は任意)
  | "miles" // マイル
  | "coupon" // クーポン
  | "stamp_card" // スタンプカード
  | "other"; // その他(自由入力)

/** 完結型(使いきる/失効するの二択が成立) or 継続型(残高が増減し続ける) */
export type AccountType = "finite" | "continuous";

/** 種類ごとのデフォルト設定(円建てフラグ・タイプ・通知タイミング初期値) */
export const CATEGORY_DEFAULTS: Record<
  AccountCategory,
  {
    isYenBased: boolean;
    type: AccountType;
    notificationDaysBefore: [first: number, second: number];
    label: string;
  }
> = {
  electronic_money: {
    isYenBased: true,
    type: "continuous",
    notificationDaysBefore: [90, 21], // 3ヶ月前/3週間前
    label: "電子マネー",
  },
  points: {
    isYenBased: true, // ユーザーが個別に変更可能(推奨表示)
    type: "continuous",
    notificationDaysBefore: [90, 21],
    label: "ポイント",
  },
  gift_certificate: {
    isYenBased: true,
    type: "finite",
    notificationDaysBefore: [90, 21],
    label: "商品券・ギフトカード",
  },
  miles: {
    isYenBased: false,
    type: "continuous",
    notificationDaysBefore: [365, 182], // 1年前/半年前
    label: "マイル",
  },
  coupon: {
    isYenBased: false,
    type: "finite",
    notificationDaysBefore: [90, 21],
    label: "クーポン",
  },
  stamp_card: {
    isYenBased: false,
    type: "finite",
    notificationDaysBefore: [120, 30], // 4ヶ月前/1ヶ月前
    label: "スタンプカード",
  },
  other: {
    isYenBased: true, // 必須選択(初期値なし相当。UI側で選択を強制する)
    type: "finite", // 必須選択(同上)
    notificationDaysBefore: [120, 30], // スタンプカード系と同じデフォルト
    label: "その他",
  },
};

/** 読み取り方法(入力パターン) */
export type InputSource =
  | "screenshot" // スクショ読み取り(デジタル系)
  | "photo_simple" // 写真読み取り・カウント不要(スタンプカード)
  | "photo_count" // 写真読み取り・現物カウント系(切手・紙の商品券)
  | "manual"; // 手入力

// ---------------------------------------------------------------------------
// users コレクション
// ---------------------------------------------------------------------------

export interface UserDoc {
  /** Firebase Anonymous Auth の UID (ドキュメントIDと同一) */
  uid: string;
  createdAt: Timestamp;
  /** 種類ごとの通知タイミングのユーザー全体デフォルト上書き(任意) */
  notificationDefaults?: Partial<
    Record<AccountCategory, { firstStageDays: number; secondStageDays: number }>
  >;
  /** プッシュ通知の送信先トークン(複数端末に対応するため配列) */
  fcmTokens?: string[];
}

// ---------------------------------------------------------------------------
// accounts コレクション
// ---------------------------------------------------------------------------

export interface AccountDoc {
  /** 将来の共有機能拡張に備えて保持。MVPでは常に自分のUID */
  ownerId: string;

  name: string;
  category: AccountCategory;
  /** category が "other" の場合の表示名(自由入力) */
  customCategoryLabel?: string;
  /**
   * 任意項目。同じサービス内で「期限あり」「期限なし」の残高が並存する場合
   * (例:楽天ポイントの通常/期間限定)、共通のグループ名を付けることで
   * 一覧の「サービス別」タブでまとめて表示できる。未入力の場合は口座名がそのまま使われる。
   */
  groupName?: string;

  isYenBased: boolean;
  type: AccountType;

  /** 残高。スタンプカードは概念自体を持たないため undefined */
  currentBalance?: number;
  /** 表示単位。円建てなら "円"、非円建てなら "pt" "マイル" "枚" など */
  balanceUnit?: string;

  /** 任意項目。空欄の場合は「期限なし・貯蓄枠タブ」に分類される */
  expiryDate?: Timestamp | null;

  /** 任意項目。実物が手元にあるタイプ全般で使用可(財布/車/引き出し 等) */
  storageLocationMemo?: string;

  notificationTiming: {
    firstStageDays: number;
    secondStageDays: number;
  };

  /** この口座を最後にスクショ/写真で更新した日時。期限切れ未更新の検知に使用 */
  lastUpdatedAt: Timestamp;

  /**
   * 重複送信防止用。「どの期限日に対して、どの段階の通知を送ったか」をISO日付文字列(YYYY-MM-DD)で記録する。
   * 期限日が更新される(撮り直し等)と自然にリセットされ、新しい期限に対して再び通知される。
   */
  notifiedFirstStageForDate?: string | null;
  notifiedSecondStageForDate?: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// accounts/{accountId}/updates サブコレクション
// ---------------------------------------------------------------------------

export interface AccountUpdateDoc {
  recordedAt: Timestamp;
  balance?: number;
  expiryDate?: Timestamp | null;
  source: InputSource;
  /** 現物カウント系(切手等)は誤読リスクが高いため、確認・修正されたか記録 */
  confirmedByUser: boolean;
}

// ---------------------------------------------------------------------------
// outcome_events コレクション(完結型のみが対象)
// ---------------------------------------------------------------------------

export type OutcomeEventType = "used_up" | "expired"; // 使いきった / 失効した

export interface OutcomeEventDoc {
  ownerId: string;
  accountId: string;
  /** 一覧・実績画面での表示用に非正規化して保持 */
  accountName: string;
  category: AccountCategory;
  eventType: OutcomeEventType;
  eventDate: Timestamp;
  /** 円建てのみ記録。非円建ての場合は undefined(件数のみで扱う) */
  amount?: number;
  isYenBased: boolean;
  createdAt: Timestamp;
}
