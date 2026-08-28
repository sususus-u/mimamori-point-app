import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";

export default function MenuPage() {
  return (
    <div>
      <p style={{ fontSize: 12, color: "#999", marginBottom: 8, paddingLeft: 2 }}>
        見る・調べる
      </p>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
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
    </div>
  );
}
