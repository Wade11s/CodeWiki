import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import ModulesPage from "./ModulesPage.js";
import type { ModulesData } from "../types.js";

describe("ModulesPage", () => {
  it("renders empty state when data is null", () => {
    const html = renderToString(<ModulesPage data={null} />);
    expect(html).toContain("No modules data available");
  });

  it("renders empty state when data is empty array", () => {
    const data: ModulesData = [];
    const html = renderToString(<ModulesPage data={data} />);
    expect(html).toContain("Modules artifact exists but contains no module entries yet");
  });

  it("renders module cards with name, path, summary", () => {
    const data: ModulesData = [
      {
        name: "Core",
        path: "src/core.ts",
        summary: "Core utilities.",
        dependencies: ["fs", "path"],
      },
    ];
    const html = renderToString(<ModulesPage data={data} />);
    expect(html).toContain("Core");
    expect(html).toContain("src/core.ts");
    expect(html).toContain("Core utilities.");
    expect(html).toContain("fs");
    expect(html).toContain("path");
  });

  it("shows incomplete badge when module is incomplete", () => {
    const data: ModulesData = [
      {
        name: "Partial",
        path: "src/partial.ts",
        summary: "",
        dependencies: [],
        incomplete: true,
      },
    ];
    const html = renderToString(<ModulesPage data={data} />);
    expect(html).toContain("Incomplete");
  });

  it("shows fallback when module has no summary", () => {
    const data: ModulesData = [
      {
        name: "Empty",
        path: "src/empty.ts",
        summary: "",
      },
    ];
    const html = renderToString(<ModulesPage data={data} />);
    expect(html).toContain("No summary available for this module");
  });

  it("handles missing dependencies gracefully", () => {
    const data: ModulesData = [
      {
        name: "NoDeps",
        path: "src/nodeps.ts",
        summary: "No dependencies here.",
      },
    ];
    const html = renderToString(<ModulesPage data={data} />);
    expect(html).toContain("NoDeps");
    expect(html).not.toContain("Dependencies:");
  });
});
