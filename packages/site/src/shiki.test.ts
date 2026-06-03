import { describe, it, expect } from "bun:test";
import { codeToHtml } from "shiki";

describe("Shiki highlighting", () => {
  it("produces HTML with syntax spans for TypeScript", async () => {
    const html = await codeToHtml("const x = 1;", {
      lang: "typescript",
      theme: "github-light",
    });
    expect(html).toContain("<span");
    expect(html).toContain("const");
    expect(html).toContain("x");
  });

  it("produces HTML with syntax spans for JavaScript", async () => {
    const html = await codeToHtml("function foo() {}", {
      lang: "javascript",
      theme: "github-light",
    });
    expect(html).toContain("<span");
    expect(html).toContain("function");
  });
});
