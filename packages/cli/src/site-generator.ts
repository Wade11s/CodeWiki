import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function findSiteDist(): string | null {
  const candidate = join(__dirname, "../../site/dist");
  if (existsSync(candidate)) {
    return candidate;
  }
  return null;
}

export function generateSite(repoPath: string): { success: boolean; siteDir: string; errors: string[] } {
  const errors: string[] = [];
  const codewikiDir = join(repoPath, ".codewiki");
  const siteDir = join(codewikiDir, "site");
  const snapshotPath = join(codewikiDir, "snapshot.json");
  const artifactsDir = join(codewikiDir, "artifacts");

  const siteDist = findSiteDist();
  if (!siteDist) {
    errors.push("Site dist not found. Build the site package first: cd packages/site && bun run build");
    return { success: false, siteDir, errors };
  }

  mkdirSync(siteDir, { recursive: true });

  copyDir(siteDist, siteDir);

  if (existsSync(snapshotPath)) {
    copyFileSync(snapshotPath, join(siteDir, "snapshot.json"));
  } else {
    errors.push("snapshot.json not found; site will load without snapshot context");
  }

  if (existsSync(artifactsDir)) {
    const siteArtifactsDir = join(siteDir, "artifacts");
    mkdirSync(siteArtifactsDir, { recursive: true });
    copyDir(artifactsDir, siteArtifactsDir);
  } else {
    errors.push("artifacts/ directory not found; site will show empty states");
  }

  return { success: errors.length === 0 || errors.every((e) => !e.includes("Site dist")), siteDir, errors };
}
