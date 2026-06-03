import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("No standalone Evidence or Q&A pages", () => {
  it("does not contain EvidencePage component", () => {
    const dir = path.join(import.meta.dir, "components");
    const files = fs.readdirSync(dir);
    const evidenceFiles = files.filter((f) =>
      f.toLowerCase().includes("evidence") && f.toLowerCase().includes("page")
    );
    expect(evidenceFiles).toEqual([]);
  });

  it("does not contain QAPage or QuestionsPage component", () => {
    const dir = path.join(import.meta.dir, "components");
    const files = fs.readdirSync(dir);
    const qaFiles = files.filter((f) =>
      /qa|question/i.test(f) && f.toLowerCase().includes("page")
    );
    expect(qaFiles).toEqual([]);
  });

  it("does not render evidence or qa routes in App", () => {
    const appPath = path.join(import.meta.dir, "App.tsx");
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).not.toMatch(/evidence.*page/i);
    expect(content).not.toMatch(/qa.*page/i);
    expect(content).not.toMatch(/question.*page/i);
  });
});
