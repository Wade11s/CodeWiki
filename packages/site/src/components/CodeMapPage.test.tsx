import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import CodeMapPage from "./CodeMapPage.js";
import type { CodeMapData } from "../types.js";

describe("CodeMapPage", () => {
  it("renders empty state when data is null", () => {
    const html = renderToString(<CodeMapPage data={null} />);
    expect(html).toContain("No code map data available");
  });

  it("renders empty state when data has no content", () => {
    const data: CodeMapData = { files: [], modules: [], claims: [] };
    const html = renderToString(<CodeMapPage data={data} />);
    expect(html).toContain("Code map artifact exists but contains no structured data yet");
  });

  it("renders modules list", () => {
    const data: CodeMapData = {
      files: [],
      modules: [
        { name: "Core", type: "package", fileCount: 12 },
        { name: "CLI", type: "package", fileCount: 5 },
      ],
    };
    const html = renderToString(<CodeMapPage data={data} />);
    expect(html).toContain("Core");
    expect(html).toContain("CLI");
    expect(html).toContain("12");
    expect(html).toContain("file");
    expect(html).toContain("5");
  });

  it("renders files grouped by module", () => {
    const data: CodeMapData = {
      files: [
        { path: "src/core/index.ts", module: "Core" },
        { path: "src/core/scan.ts", module: "Core" },
        { path: "src/cli/main.ts", module: "CLI" },
      ],
      modules: [],
    };
    const html = renderToString(<CodeMapPage data={data} />);
    expect(html).toContain("Core");
    expect(html).toContain("CLI");
    expect(html).toContain("src/core/index.ts");
    expect(html).toContain("src/core/scan.ts");
    expect(html).toContain("src/cli/main.ts");
  });

  it("renders claims with evidence", () => {
    const data: CodeMapData = {
      files: [{ path: "src/index.ts", module: "Core" }],
      modules: [],
      claims: [
        {
          statement: "Main entry is src/index.ts.",
          evidence: [
            { filePath: "src/index.ts", lineStart: 1, lineEnd: 3, snippet: "" },
          ],
        },
      ],
    };
    const html = renderToString(<CodeMapPage data={data} />);
    expect(html).toContain("Main entry is src/index.ts.");
    expect(html).toContain("src/index.ts:1-3");
  });

  it("shows incomplete banner when flagged", () => {
    const data: CodeMapData = {
      files: [{ path: "a.ts", module: "M" }],
      modules: [],
      incomplete: true,
    };
    const html = renderToString(<CodeMapPage data={data} />);
    expect(html).toContain("incomplete");
  });
});
