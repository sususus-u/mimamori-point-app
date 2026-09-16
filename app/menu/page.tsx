import Link from "next/link";
import { BarChart3, ChevronRight, ExternalLink, FileText, User } from "lucide-react";
import AccountSettings from "@/components/AccountSettings";

const HUB_TERMS_URL = "https://okizukibiyori.com/terms#たまりびより";
const HUB_PRIVACY_URL = "https://okizukibiyori.com/privacy#たまりびより";

export default function MenuPage() {
  return (
    <div>
      <p style={{ fontSize: 12, color: "#999", marginBottom: 8, paddingLeft: 2 }}>
        見る・調べる
      </p>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
        <Link
          href="/reports"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <BarChart3 size={18} color="var(--brand)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>実績</span>
          <ChevronRight size={16} color="#ccc" />
        </Link>
      </div>

      <p style={{ fontSize: 12, color: "#999", marginBottom: 8, paddingLeft: 2 }}>
        設定
      </p>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "14px",
          }}
        >
          <User size={18} color="var(--brand)" style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>アカウント</p>
            <AccountSettings />
          </div>
        </div>

        <a
          href={HUB_TERMS_URL}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px",
            textDecoration: "none",
            color: "inherit",
            borderTop: "0.5px solid #eee",
          }}
        >
          <FileText size={18} color="var(--brand)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>利用規約</span>
          <ExternalLink size={16} color="#ccc" />
        </a>

        <a
          href={HUB_PRIVACY_URL}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px",
            textDecoration: "none",
            color: "inherit",
            borderTop: "0.5px solid #eee",
          }}
        >
          <FileText size={18} color="var(--brand)" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>プライバシーポリシー</span>
          <ExternalLink size={16} color="#ccc" />
        </a>
      </div>
    </div>
  );
}
