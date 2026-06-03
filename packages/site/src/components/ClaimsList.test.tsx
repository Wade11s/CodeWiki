import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import ClaimsList from "./ClaimsList.js";
import type { Claim } from "../types.js";

describe("ClaimsList", () => {
  it("renders nothing when claims array is empty", () => {
    const html = renderToString(<ClaimsList claims={[]} />);
    expect(html).toBe("");
  });

  it("renders claim statements", () => {
    const claims: Claim[] = [
      { statement: "The app uses React for UI.", evidence: [] },
    ];
    const html = renderToString(<ClaimsList claims={claims} />);
    expect(html).toContain("The app uses React for UI.");
  });

  it("filters out claims with empty statements", () => {
    const claims: Claim[] = [
      { statement: "", evidence: [] },
      { statement: "Valid claim.", evidence: [] },
    ];
    const html = renderToString(<ClaimsList claims={claims} />);
    expect(html).not.toContain('style="margin:0"');
    expect(html).toContain("Valid claim.");
  });

  it("renders evidence references when present", () => {
    const claims: Claim[] = [
      {
        statement: "Entry point is main.ts.",
        evidence: [{ filePath: "src/main.ts", lineStart: 1, lineEnd: 5, snippet: "" }],
      },
    ];
    const html = renderToString(<ClaimsList claims={claims} />);
    expect(html).toContain("Entry point is main.ts.");
    expect(html).toContain("src/main.ts:1-5");
  });

  it("renders multiple claims", () => {
    const claims: Claim[] = [
      { statement: "First claim.", evidence: [] },
      { statement: "Second claim.", evidence: [] },
    ];
    const html = renderToString(<ClaimsList claims={claims} />);
    expect(html).toContain("First claim.");
    expect(html).toContain("Second claim.");
  });
});
