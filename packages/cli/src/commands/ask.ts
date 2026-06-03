import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readSnapshot,
  loadConfig,
  loadIndexFacts,
  isSnapshotStale,
  CodeWikiError,
  AgentRunner,
  createDefaultRunner,
} from "@codewiki/core";
import type { IndexFacts, Evidence, Claim } from "@codewiki/core";

interface AskOptions {
  json?: boolean;
  agent?: string;
  runner?: AgentRunner;
}

interface RetrievedEvidence {
  type: string;
  source: string;
  content: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
}

interface AskResult {
  answer: string;
  evidence: Evidence[];
  confidence: number;
  snapshotId: string;
  stale: boolean;
  searchedScopes: string[];
  suggestedNextSteps: string[];
  agent: string;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare",
  "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
  "from", "as", "into", "through", "during", "before", "after", "above",
  "below", "between", "under", "and", "but", "or", "yet", "so", "if",
  "because", "although", "though", "while", "where", "when", "that",
  "which", "who", "whom", "whose", "what", "how", "why", "this", "these",
  "those", "i", "you", "he", "she", "it", "we", "they", "me", "him",
  "her", "us", "them", "my", "your", "his", "its", "our", "their",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function scoreMatch(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

function loadArtifacts(codewikiDir: string): Array<{ type: string; data: unknown }> {
  const artifactsDir = join(codewikiDir, "artifacts");
  if (!existsSync(artifactsDir)) return [];

  const artifacts: Array<{ type: string; data: unknown }> = [];
  const files = ["overview.json", "features.json", "code-map.json", "modules.json"];

  for (const file of files) {
    const path = join(artifactsDir, file);
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      if (raw.data) {
        artifacts.push({ type: file.replace(".json", ""), data: raw.data });
      }
    } catch {
      // ignore malformed artifact files
    }
  }

  return artifacts;
}

function extractClaims(data: unknown): Claim[] {
  if (typeof data !== "object" || data === null) return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.claims)) {
    return obj.claims as Claim[];
  }
  return [];
}

function searchIndexFacts(indexFacts: IndexFacts, keywords: string[]): RetrievedEvidence[] {
  const results: Array<{ evidence: RetrievedEvidence; score: number }> = [];

  for (const sym of indexFacts.symbols) {
    const text = `${sym.name} ${sym.snippet} ${sym.filePath} ${sym.kind}`;
    const score = scoreMatch(text, keywords);
    if (score > 0) {
      results.push({
        evidence: {
          type: "symbol",
          source: sym.name,
          content: sym.snippet,
          filePath: sym.filePath,
          lineStart: sym.lineStart,
          lineEnd: sym.lineEnd,
          snippet: sym.snippet,
        },
        score,
      });
    }
  }

  for (const blk of indexFacts.blocks) {
    const text = `${blk.name} ${blk.snippet} ${blk.filePath} ${blk.kind}`;
    const score = scoreMatch(text, keywords);
    if (score > 0) {
      results.push({
        evidence: {
          type: "block",
          source: blk.name,
          content: blk.snippet,
          filePath: blk.filePath,
          lineStart: blk.lineStart,
          lineEnd: blk.lineEnd,
          snippet: blk.snippet,
        },
        score,
      });
    }
  }

  for (const mod of indexFacts.modules) {
    const text = `${mod.name} ${mod.files.join(" ")} ${mod.type}`;
    const score = scoreMatch(text, keywords);
    if (score > 0) {
      results.push({
        evidence: {
          type: "module",
          source: mod.name,
          content: `Module ${mod.name} (${mod.type}) with ${mod.files.length} files`,
          filePath: mod.files[0],
        },
        score,
      });
    }
  }

  for (const imp of indexFacts.imports) {
    const text = `${imp.source} ${imp.names.join(" ")} ${imp.filePath}`;
    const score = scoreMatch(text, keywords);
    if (score > 0) {
      results.push({
        evidence: {
          type: "import",
          source: imp.source,
          content: imp.snippet,
          filePath: imp.filePath,
          lineStart: imp.lineStart,
          lineEnd: imp.lineEnd,
          snippet: imp.snippet,
        },
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 20).map((r) => r.evidence);
}

function searchArtifacts(
  artifacts: Array<{ type: string; data: unknown }>,
  keywords: string[]
): RetrievedEvidence[] {
  const results: Array<{ evidence: RetrievedEvidence; score: number }> = [];

  for (const artifact of artifacts) {
    const claims = extractClaims(artifact.data);
    for (const claim of claims) {
      const text = `${claim.statement} ${claim.evidence.map((e) => e.filePath).join(" ")}`;
      const score = scoreMatch(text, keywords);
      if (score > 0) {
        for (const ev of claim.evidence) {
          results.push({
            evidence: {
              type: "artifact-claim",
              source: `${artifact.type}: ${claim.statement}`,
              content: claim.statement,
              filePath: ev.filePath,
              lineStart: ev.lineStart,
              lineEnd: ev.lineEnd,
              snippet: ev.snippet,
            },
            score,
          });
        }
      }
    }

    if (artifact.type === "features" && typeof artifact.data === "object" && artifact.data !== null) {
      const data = artifact.data as Record<string, unknown>;
      if (Array.isArray(data.candidates)) {
        for (const cand of data.candidates) {
          const c = cand as Record<string, unknown>;
          const name = String(c.name || "");
          const desc = String(c.description || "");
          const text = `${name} ${desc}`;
          const score = scoreMatch(text, keywords);
          if (score > 0 && Array.isArray(c.evidence)) {
            for (const ev of c.evidence as Evidence[]) {
              results.push({
                evidence: {
                  type: "feature-candidate",
                  source: name,
                  content: desc,
                  filePath: ev.filePath,
                  lineStart: ev.lineStart,
                  lineEnd: ev.lineEnd,
                  snippet: ev.snippet,
                },
                score,
              });
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 20).map((r) => r.evidence);
}

function validateCitations(
  citations: Evidence[],
  indexFacts: IndexFacts
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const ev of citations) {
    if (!ev.filePath) {
      errors.push("Citation missing filePath");
      continue;
    }

    const fileExists = indexFacts.modules.some((m) => m.files.includes(ev.filePath));
    if (!fileExists) {
      errors.push(`Citation references unknown file: ${ev.filePath}`);
      continue;
    }

    if (ev.lineStart && ev.lineEnd) {
      const matchingSymbols = indexFacts.symbols.filter(
        (s) => s.filePath === ev.filePath && s.lineStart <= ev.lineStart && s.lineEnd >= ev.lineEnd
      );
      const matchingBlocks = indexFacts.blocks.filter(
        (b) => b.filePath === ev.filePath && b.lineStart <= ev.lineStart && b.lineEnd >= ev.lineEnd
      );

      const anySymbolCovers = matchingSymbols.length > 0;
      const anyBlockCovers = matchingBlocks.length > 0;

      if (!anySymbolCovers && !anyBlockCovers) {
        const fileBlocks = indexFacts.blocks.filter((b) => b.filePath === ev.filePath);
        const fileSymbols = indexFacts.symbols.filter((s) => s.filePath === ev.filePath);
        const maxLine = Math.max(
          ...fileBlocks.map((b) => b.lineEnd),
          ...fileSymbols.map((s) => s.lineEnd),
          0
        );
        if (maxLine > 0 && ev.lineEnd > maxLine) {
          errors.push(
            `Citation line range exceeds file bounds: ${ev.lineEnd} > ${maxLine}`
          );
        }
      }

      if (ev.symbol) {
        const symbolMatch = indexFacts.symbols.find(
          (s) => s.filePath === ev.filePath && s.name === ev.symbol
        );
        if (!symbolMatch) {
          errors.push(
            `Citation references unknown symbol "${ev.symbol}" in ${ev.filePath}`
          );
        } else if (ev.lineStart < symbolMatch.lineStart || ev.lineEnd > symbolMatch.lineEnd) {
          errors.push(
            `Citation line range does not match symbol "${ev.symbol}" bounds`
          );
        }
      }

      if (ev.blockId) {
        const blockMatch = indexFacts.blocks.find((b) => b.id === ev.blockId);
        if (!blockMatch) {
          errors.push(`Citation references unknown blockId "${ev.blockId}"`);
        } else if (blockMatch.filePath !== ev.filePath) {
          errors.push(
            `Block "${ev.blockId}" is in ${blockMatch.filePath}, not ${ev.filePath}`
          );
        } else if (ev.lineStart < blockMatch.lineStart || ev.lineEnd > blockMatch.lineEnd) {
          errors.push(
            `Citation line range does not match block "${ev.blockId}" bounds`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function buildAskPrompt(question: string, evidence: RetrievedEvidence[]): string {
  const evidenceText = evidence
    .map((ev, i) => {
      const loc = ev.filePath
        ? ` (${ev.filePath}${ev.lineStart ? `:${ev.lineStart}-${ev.lineEnd}` : ""})`
        : "";
      return `[${i + 1}] ${ev.type}: ${ev.source}${loc}\n${ev.content}`;
    })
    .join("\n\n");

  return `Answer the following question using only the provided indexed evidence. Every claim in your answer must be backed by a citation from the evidence.

Question: ${question}

Indexed Evidence:
${evidenceText}

Respond with valid JSON in this exact format:
{
  "answer": "Your concise answer here",
  "confidence": 0.85,
  "citations": [
    {
      "filePath": "src/example.ts",
      "lineStart": 1,
      "lineEnd": 5,
      "snippet": "relevant code snippet"
    }
  ]
}

Rules:
- Only cite evidence that is listed above.
- Every citation must reference a real file path and valid line numbers from the indexed evidence.
- If the evidence does not support a confident answer, return {"answer": "", "confidence": 0, "citations": []}.`;
}

function parseAskResponse(stdout: string): { answer: string; confidence: number; citations: Evidence[] } | null {
  try {
    const parsed = JSON.parse(stdout);
    if (typeof parsed.answer !== "string") return null;
    if (typeof parsed.confidence !== "number") return null;
    if (!Array.isArray(parsed.citations)) return null;

    const citations: Evidence[] = [];
    for (const c of parsed.citations) {
      if (
        typeof c.filePath === "string" &&
        typeof c.lineStart === "number" &&
        typeof c.lineEnd === "number" &&
        typeof c.snippet === "string"
      ) {
        citations.push({
          filePath: c.filePath,
          lineStart: c.lineStart,
          lineEnd: c.lineEnd,
          snippet: c.snippet,
          symbol: typeof c.symbol === "string" ? c.symbol : undefined,
          blockId: typeof c.blockId === "string" ? c.blockId : undefined,
        });
      }
    }

    return { answer: parsed.answer, confidence: parsed.confidence, citations };
  } catch {
    return null;
  }
}

function makeRefusalResult(
  snapshotId: string,
  stale: boolean,
  searchedScopes: string[]
): AskResult {
  return {
    answer: "No answer: insufficient indexed evidence.",
    evidence: [],
    confidence: 0,
    snapshotId,
    stale,
    searchedScopes,
    suggestedNextSteps: [
      "Run 'codewiki scan' to refresh the index with the latest code.",
      "Try rephrasing your question to match known symbols, modules, or file names.",
    ],
    agent: "",
  };
}

function outputResult(result: AskResult, json?: boolean): void {
  if (json) {
    console.log(
      JSON.stringify(
        {
          answer: result.answer,
          evidence: result.evidence,
          confidence: result.confidence,
          snapshotId: result.snapshotId,
          stale: result.stale,
          searchedScopes: result.searchedScopes,
          suggestedNextSteps: result.suggestedNextSteps,
          agent: result.agent,
        },
        null,
        2
      )
    );
  } else {
    console.log(`## Answer\n\n${result.answer}\n`);
    if (result.evidence.length > 0) {
      console.log(`## Evidence\n`);
      for (const ev of result.evidence) {
        console.log(`- \`${ev.filePath}:${ev.lineStart}-${ev.lineEnd}\`: ${ev.snippet}`);
      }
      console.log("");
    } else {
      console.log(`## Evidence\n\nNo evidence available.\n`);
    }
    console.log(`## Confidence\n\n${result.confidence}\n`);
    console.log(
      `## Index\n\n- Snapshot: ${result.snapshotId}\n- Stale: ${result.stale}\n- Searched: ${result.searchedScopes.join(", ")}\n`
    );
    if (result.suggestedNextSteps.length > 0) {
      console.log(`## Suggested Next Steps\n`);
      for (const step of result.suggestedNextSteps) {
        console.log(`- ${step}`);
      }
      console.log("");
    }
    console.log(`## Agent\n\n- Provider: ${result.agent || "none"}\n`);
  }
}

export async function askCommand(
  repoPath: string,
  question: string,
  options: AskOptions
): Promise<void> {
  const snapshot = readSnapshot(repoPath);
  if (!snapshot) {
    throw new CodeWikiError(
      `Error: No snapshot found for ${repoPath}. Run 'codewiki scan ${repoPath}' first.`
    );
  }

  const config = loadConfig(repoPath);
  const effectiveAgent = options.agent || config.agent.default;

  const codewikiDir = join(repoPath, ".codewiki");
  const indexFacts = loadIndexFacts(codewikiDir);
  const stale = isSnapshotStale(repoPath, snapshot);

  const searchedScopes: string[] = [];
  if (indexFacts) searchedScopes.push("index");

  const artifacts = loadArtifacts(codewikiDir);
  if (artifacts.length > 0) searchedScopes.push("artifacts");

  if (!indexFacts) {
    const result = makeRefusalResult(snapshot.id, stale, searchedScopes);
    outputResult(result, options.json);
    return;
  }

  const keywords = tokenize(question);
  if (keywords.length === 0) {
    const result = makeRefusalResult(snapshot.id, stale, searchedScopes);
    outputResult(result, options.json);
    return;
  }

  const indexEvidence = searchIndexFacts(indexFacts, keywords);
  const artifactEvidence = searchArtifacts(artifacts, keywords);
  const allEvidence = [...indexEvidence, ...artifactEvidence];

  const seen = new Set<string>();
  const uniqueEvidence: RetrievedEvidence[] = [];
  for (const ev of allEvidence) {
    const key = `${ev.filePath}:${ev.lineStart || 0}:${ev.lineEnd || 0}:${ev.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEvidence.push(ev);
    }
  }

  if (uniqueEvidence.length === 0) {
    const result = makeRefusalResult(snapshot.id, stale, searchedScopes);
    outputResult(result, options.json);
    return;
  }

  const prompt = buildAskPrompt(question, uniqueEvidence);

  const runner = options.runner || createDefaultRunner();
  const taskResult = await runner.runTask(effectiveAgent, {
    prompt,
    repoIndexPath: repoPath,
    inputArtifacts: [],
    outputSchema: "ask-response",
    timeoutSeconds: Math.min(config.agent.timeoutSeconds, 120),
    retries: config.agent.retries,
  });

  if (taskResult.state !== "success") {
    const result = makeRefusalResult(snapshot.id, stale, searchedScopes);
    outputResult(result, options.json);
    return;
  }

  const parsed = parseAskResponse(taskResult.stdout);
  if (!parsed) {
    const result = makeRefusalResult(snapshot.id, stale, searchedScopes);
    outputResult(result, options.json);
    return;
  }

  if (parsed.confidence < 0.3 || !parsed.answer || parsed.answer.trim().length === 0) {
    const result = makeRefusalResult(snapshot.id, stale, searchedScopes);
    outputResult(result, options.json);
    return;
  }

  const validation = validateCitations(parsed.citations, indexFacts);
  if (!validation.valid) {
    const result = makeRefusalResult(snapshot.id, stale, searchedScopes);
    outputResult(result, options.json);
    return;
  }

  const result: AskResult = {
    answer: parsed.answer,
    evidence: parsed.citations,
    confidence: parsed.confidence,
    snapshotId: snapshot.id,
    stale,
    searchedScopes,
    suggestedNextSteps: [],
    agent: effectiveAgent,
  };

  outputResult(result, options.json);
}
