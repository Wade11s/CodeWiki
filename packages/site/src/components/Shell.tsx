import type { PageKey } from "../types.js";

interface Props {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
  children: React.ReactNode;
}

const PAGES: { key: PageKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "modules", label: "Modules" },
  { key: "features", label: "Features" },
  { key: "code-map", label: "Code Map" },
];

export default function Shell({ activePage, onNavigate, children }: Props) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <nav
        style={{
          width: "200px",
          background: "#1e293b",
          color: "#e2e8f0",
          padding: "1rem 0",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "0 1rem 1rem", fontWeight: 700, fontSize: "1.125rem", borderBottom: "1px solid #334155" }}>
          CodeWiki
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0" }}>
          {PAGES.map((page) => (
            <li key={page.key}>
              <button
                onClick={() => onNavigate(page.key)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.5rem 1rem",
                  background: "none",
                  border: "none",
                  color: activePage === page.key ? "#38bdf8" : "#cbd5e1",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "0.9375rem",
                  fontWeight: activePage === page.key ? 600 : 400,
                  borderLeft: activePage === page.key ? "3px solid #38bdf8" : "3px solid transparent",
                }}
              >
                {page.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ flex: 1, overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
