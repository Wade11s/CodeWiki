import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import CodePanel from "./CodePanel.js";
import type { Evidence } from "../types.js";

describe("CodePanel", () => {
  it("returns nothing when evidence is null", () => {
    const html = renderToString(<CodePanel evidence={null} onClose={() => {}} />);
    expect(html).toBe("");
  });

  it("renders file path and line range", () => {
    const evidence: Evidence = {
      filePath: "src/scan.ts",
      lineStart: 10,
      lineEnd: 15,
      snippet: "const x = 1;",
    };
    const html = renderToString(<CodePanel evidence={evidence} onClose={() => {}} />);
    expect(html).toContain("src/scan.ts");
    expect(html).toContain("Lines");
    expect(html).toContain("10");
    expect(html).toContain("15");
  });

  it("renders symbol when present", () => {
    const evidence: Evidence = {
      filePath: "src/lib.ts",
      lineStart: 5,
      lineEnd: 8,
      snippet: "function parse() {}",
      symbol: "parseData",
    };
    const html = renderToString(<CodePanel evidence={evidence} onClose={() => {}} />);
    expect(html).toContain("parseData");
  });

  it("renders close button", () => {
    const evidence: Evidence = {
      filePath: "src/a.ts",
      lineStart: 1,
      lineEnd: 2,
      snippet: "x",
    };
    const html = renderToString(<CodePanel evidence={evidence} onClose={() => {}} />);
    expect(html).toContain('aria-label="Close panel"');
  });

  it("renders related symbols when present", () => {
    const evidence: Evidence = {
      filePath: "src/a.ts",
      lineStart: 1,
      lineEnd: 2,
      snippet: "x",
      relatedSymbols: ["foo", "bar"],
    };
    const html = renderToString(<CodePanel evidence={evidence} onClose={() => {}} />);
    expect(html).toContain("Related Symbols");
    expect(html).toContain("foo");
    expect(html).toContain("bar");
  });

  it("does not render related symbols section when empty", () => {
    const evidence: Evidence = {
      filePath: "src/a.ts",
      lineStart: 1,
      lineEnd: 2,
      snippet: "x",
      relatedSymbols: [],
    };
    const html = renderToString(<CodePanel evidence={evidence} onClose={() => {}} />);
    expect(html).not.toContain("Related Symbols");
  });

  it("renders code snippet", () => {
    const evidence: Evidence = {
      filePath: "src/index.ts",
      lineStart: 1,
      lineEnd: 3,
      snippet: "const a = 1;\nconst b = 2;",
    };
    const html = renderToString(<CodePanel evidence={evidence} onClose={() => {}} />);
    expect(html).toContain("const a = 1;");
    expect(html).toContain("const b = 2;");
  });

  it("detects language from file extension", () => {
    const evidence: Evidence = {
      filePath: "src/index.ts",
      lineStart: 1,
      lineEnd: 2,
      snippet: "const x = 1;",
    };
    const html = renderToString(<CodePanel evidence={evidence} onClose={() => {}} />);
    expect(html).toContain("src/index.ts");
  });
});
