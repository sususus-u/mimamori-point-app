"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { enableNotifications, listenForForegroundMessages } from "@/lib/messaging";

export default function NotificationSetup() {
  const { uid } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "enabled" | "error">("idle");
  const [errorReason, setErrorReason] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && Notification.permission === "granted") {
      setStatus("enabled");
      listenForForegroundMessages();
    }
  }, []);

  async function handleClick() {
    if (!uid) return;
    setStatus("loading");
    const result = await enableNotifications(uid);
    if (result.success) {
      setStatus("enabled");
      listenForForegroundMessages();
    } else {
      setStatus("error");
      setErrorReason(result.reason);
    }
  }

  if (status === "enabled") {
    return <p className="text-xs text-gray-500">通知が有効になりました</p>;
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        className="text-xs border border-gray-300 rounded-md px-2 py-1 disabled:opacity-50"
      >
        {status === "loading" ? "設定中..." : "🔔 通知を有効にする"}
      </button>
      {status === "error" && <p className="text-xs text-red-600 mt-1">{errorReason}</p>}
    </div>
  );
}
