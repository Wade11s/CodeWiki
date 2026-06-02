import { useState, useEffect, useCallback } from "react";
import type { PageKey } from "./types.js";
import { useArtifacts } from "./hooks/useArtifacts.js";
import Shell from "./components/Shell.js";
import SnapshotBanner from "./components/SnapshotBanner.js";
import OverviewPage from "./components/OverviewPage.js";
import ModulesPage from "./components/ModulesPage.js";
import FeaturesPage from "./components/FeaturesPage.js";
import CodeMapPage from "./components/CodeMapPage.js";

function getPageFromHash(): PageKey {
  const hash = window.location.hash.replace("#", "");
  if (hash === "modules" || hash === "features" || hash === "code-map") {
    return hash;
  }
  return "overview";
}

function App() {
  const [activePage, setActivePage] = useState<PageKey>(getPageFromHash);
  const { snapshot, overview, modules, loading, errors } = useArtifacts();

  useEffect(() => {
    function handleHashChange() {
      setActivePage(getPageFromHash());
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleNavigate = useCallback((page: PageKey) => {
    window.location.hash = page;
    setActivePage(page);
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          color: "#64748b",
        }}
      >
        Loading report...
      </div>
    );
  }

  return (
    <Shell activePage={activePage} onNavigate={handleNavigate}>
      <SnapshotBanner snapshot={snapshot} />
      {errors.length > 0 && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            borderBottom: "1px solid #fecaca",
            fontSize: "0.875rem",
            color: "#991b1b",
          }}
        >
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
      {activePage === "overview" && <OverviewPage data={overview} />}
      {activePage === "modules" && <ModulesPage data={modules} />}
      {activePage === "features" && <FeaturesPage />}
      {activePage === "code-map" && <CodeMapPage />}
    </Shell>
  );
}

export default App;
