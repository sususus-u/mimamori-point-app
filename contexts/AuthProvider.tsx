"use client";

// アプリを開いたら自動的に匿名認証でサインインし、
// 以降どの画面からも useAuth() でログイン中のUIDを取得できるようにする。

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextValue {
  /** サインイン処理が完了するまで true。読み込み中の表示に使う */
  isLoading: boolean;
  /** サインイン済みユーザーのUID。読み込み中は null */
  uid: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  isLoading: true,
  uid: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        setUid(user.uid);
        setIsLoading(false);
      } else {
        // まだ誰もサインインしていない場合は、匿名で自動サインインする
        try {
          await signInAnonymously(auth);
          // 成功すると、この onAuthStateChanged が再度呼ばれて user が入る
        } catch (error) {
          console.error("匿名サインインに失敗しました", error);
          setIsLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ isLoading, uid }}>
      {children}
    </AuthContext.Provider>
  );
}

/** 画面側からログイン中のUIDを取得するためのフック */
export function useAuth() {
  return useContext(AuthContext);
}
