"use client";

// ハブのログイン(?authToken= の引き継ぎ)で入った人だけを「ログイン済み」として扱い、
// どの画面からも useAuth() でログイン中のUIDを取得できるようにする。
// 匿名ログインは使わない。ログインしていないときは uid が null のままで、
// 画面側(AppShell)が案内の画面を出す。

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, customTokenSignInReady, hasCustomTokenHandoffFailed } from "@/lib/firebase";
import { resetHubLoginCount } from "@/lib/hubLogin";

interface AuthContextValue {
  /** ログイン状態の確認が終わるまで true。読み込み中の表示に使う */
  isLoading: boolean;
  /** ログイン済み(匿名でない)ユーザーのUID。未ログイン・確認中は null */
  uid: string | null;
  /** ハブからの引き継ぎ(?authToken=)に失敗したか。メモリ上だけの印 */
  handoffFailed: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  isLoading: true,
  uid: null,
  handoffFailed: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [handoffFailed, setHandoffFailed] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    // ハブからのカスタムトークンログイン処理(モジュール読み込み時点で開始済み)が
    // 終わるまで、ログイン状態の判定を始めない。先にonAuthStateChangedを
    // 購読してしまうと、永続化復元で残っていた古いユーザーを先に見てしまう
    // 競合状態が起きるため。
    customTokenSignInReady.then(() => {
      if (cancelled) return;
      setHandoffFailed(hasCustomTokenHandoffFailed());
      unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
        if (user && !user.isAnonymous) {
          resetHubLoginCount();
          setUid(user.uid);
          setIsLoading(false);
          return;
        }
        // ログイン中の人がいない、または端末に古い匿名ログインが残っていた場合は、
        // 未ログインとして扱う。匿名ユーザーは、サインアウトして残さない。
        setUid(null);
        if (user) {
          try {
            await signOut(auth);
            // 成功すると、この onAuthStateChanged が user=null で再度呼ばれる
          } catch (error) {
            console.error("匿名ユーザーのサインアウトに失敗しました", error);
          }
        }
        setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ isLoading, uid, handoffFailed }}>
      {children}
    </AuthContext.Provider>
  );
}

/** 画面側からログイン中のUIDを取得するためのフック */
export function useAuth() {
  return useContext(AuthContext);
}
