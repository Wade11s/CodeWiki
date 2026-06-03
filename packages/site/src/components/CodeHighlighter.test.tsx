import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import CodeHighlighter, { detectLanguage } from "./CodeHighlighter.js";

describe("CodeHighlighter", () => {
  it("renders plain code block before highlighting", () => {
    const html = renderToString(<CodeHighlighter code="const x = 1;" language="typescript" />);
    expect(html).toContain("const x = 1;");
    expect(html).toContain("<pre");
  });
});

describe("detectLanguage", () => {
  it("detects TypeScript from .ts extension", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript");
  });

  it("detects TSX from .tsx extension", () => {
    expect(detectLanguage("src/App.tsx")).toBe("tsx");
  });

  it("detects JavaScript from .js extension", () => {
    expect(detectLanguage("src/lib.js")).toBe("javascript");
  });

  it("detects Python from .py extension", () => {
    expect(detectLanguage("main.py")).toBe("python");
  });

  it("returns text for unknown extensions", () => {
    expect(detectLanguage("README")).toBe("text");
    expect(detectLanguage("config.xyz")).toBe("text");
  });

  it("detects Dockerfile by basename", () => {
    expect(detectLanguage("/project/Dockerfile")).toBe("dockerfile");
    expect(detectLanguage("Dockerfile")).toBe("dockerfile");
  });

  it("detects Makefile by basename", () => {
    expect(detectLanguage("/project/Makefile")).toBe("makefile");
    expect(detectLanguage("Makefile")).toBe("makefile");
  });

  it("detects Jenkinsfile by basename", () => {
    expect(detectLanguage("/ci/Jenkinsfile")).toBe("groovy");
    expect(detectLanguage("Jenkinsfile")).toBe("groovy");
  });
});
