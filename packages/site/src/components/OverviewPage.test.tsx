import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import OverviewPage from "./OverviewPage.js";
import type { OverviewData } from "../types.js";

describe("OverviewPage", () => {
  it("renders empty state when data is null", () => {
    const html = renderToString(<OverviewPage data={null} />);
    expect(html).toContain("No overview data available");
  });

  it("renders empty state when data has no content", () => {
    const data: OverviewData = { summary: "" };
    const html = renderToString(<OverviewPage data={data} />);
    expect(html).toContain("Overview artifact exists but contains no structured data yet");
  });

  it("renders summary when present", () => {
    const data: OverviewData = { summary: "A test repository." };
    const html = renderToString(<OverviewPage data={data} />);
    expect(html).toContain("A test repository.");
    expect(html).toContain("Summary");
  });

  it("renders architecture when present", () => {
    const data: OverviewData = { architecture: "Monolithic design." };
    const html = renderToString(<OverviewPage data={data} />);
    expect(html).toContain("Monolithic design.");
    expect(html).toContain("Architecture");
  });

  it("renders technology stack as list", () => {
    const data: OverviewData = { technologyStack: ["TypeScript", "React"] };
    const html = renderToString(<OverviewPage data={data} />);
    expect(html).toContain("Technology Stack");
    expect(html).toContain("TypeScript");
    expect(html).toContain("React");
  });

  it("renders entry points", () => {
    const data: OverviewData = {
      entryPoints: [
        { path: "src/index.ts", description: "Main entry" },
        { path: "bin/cli.js" },
      ],
    };
    const html = renderToString(<OverviewPage data={data} />);
    expect(html).toContain("Entry Points");
    expect(html).toContain("src/index.ts");
    expect(html).toContain("Main entry");
    expect(html).toContain("bin/cli.js");
  });

  it("renders run model when present", () => {
    const data: OverviewData = { runModel: "Run with npm start." };
    const html = renderToString(<OverviewPage data={data} />);
    expect(html).toContain("Run with npm start.");
    expect(html).toContain("Run Model");
  });
});
