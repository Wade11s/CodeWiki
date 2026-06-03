import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import FeaturesPage from "./FeaturesPage.js";
import type { FeaturesData } from "../types.js";

describe("FeaturesPage", () => {
  it("renders empty state when data is null", () => {
    const html = renderToString(<FeaturesPage data={null} />);
    expect(html).toContain("No features data available");
  });

  it("renders empty state when data is empty array", () => {
    const data: FeaturesData = [];
    const html = renderToString(<FeaturesPage data={data} />);
    expect(html).toContain("Features artifact exists but contains no feature entries yet");
  });

  it("renders features grouped by category", () => {
    const data: FeaturesData = [
      {
        id: "f1",
        category: "cli",
        name: "Scan command",
        description: "Scans a repository.",
        claims: [],
      },
      {
        id: "f2",
        category: "cli",
        name: "Serve command",
        description: "Serves the report.",
        claims: [],
      },
      {
        id: "f3",
        category: "api",
        name: "REST API",
        claims: [],
      },
    ];
    const html = renderToString(<FeaturesPage data={data} />);
    expect(html).toContain("cli");
    expect(html).toContain("api");
    expect(html).toContain("Scan command");
    expect(html).toContain("Serve command");
    expect(html).toContain("REST API");
  });

  it("renders claims with evidence on a feature", () => {
    const data: FeaturesData = [
      {
        id: "f1",
        category: "cli",
        name: "Scan",
        claims: [
          {
            statement: "Uses fs.readdir for traversal.",
            evidence: [
              { filePath: "src/scan.ts", lineStart: 10, lineEnd: 12, snippet: "fs.readdir" },
            ],
          },
        ],
      },
    ];
    const html = renderToString(<FeaturesPage data={data} />);
    expect(html).toContain("Uses fs.readdir for traversal.");
    expect(html).toContain("src/scan.ts:10-12");
  });

  it("handles feature without description", () => {
    const data: FeaturesData = [
      {
        id: "f1",
        category: "test",
        name: "Unit tests",
        claims: [],
      },
    ];
    const html = renderToString(<FeaturesPage data={data} />);
    expect(html).toContain("Unit tests");
    expect(html).toContain("test");
  });

  it("handles unnamed feature gracefully", () => {
    const data: FeaturesData = [
      {
        id: "f1",
        category: "export",
        name: "",
        claims: [],
      },
    ];
    const html = renderToString(<FeaturesPage data={data} />);
    expect(html).toContain("Unnamed feature");
  });
});
