import type { AgentProvider, TaskResult, DetectedAgent } from "./types.js";

export class FakeProvider implements AgentProvider {
  name: string;

  private behavior: "success" | "fail" | "validate" | "flaky" = "success";
  private failAfterRetries = 0;
  private callCount = 0;

  constructor(name = "fake") {
    this.name = name;
  }

  setBehavior(behavior: "success" | "fail" | "validate" | "flaky", failAfterRetries = 0): void {
    this.behavior = behavior;
    this.failAfterRetries = failAfterRetries;
    this.callCount = 0;
  }

  async detect(): Promise<DetectedAgent | null> {
    return {
      name: "fake",
      command: "fake-agent",
      version: "0.1.0",
      available: true,
      health: "healthy",
      default: false,
    };
  }

  async runTask(options: {
    prompt: string;
    repoIndexPath: string;
    inputArtifacts: string[];
    outputSchema: string;
    timeoutSeconds: number;
  }): Promise<TaskResult> {
    this.callCount++;

    if (this.behavior === "fail") {
      return {
        taskId: `fake-${Date.now()}`,
        exitCode: 1,
        durationMs: 10,
        stdout: "",
        stderr: `Simulated failure for: ${options.prompt.slice(0, 50)}...`,
        retries: 0,
        validationErrors: [],
      };
    }

    if (this.behavior === "flaky") {
      // Fail on first N-1 calls, succeed on Nth call
      if (this.callCount <= this.failAfterRetries) {
        return {
          taskId: `fake-${Date.now()}`,
          exitCode: 1,
          durationMs: 10,
          stdout: "",
          stderr: `Flaky failure attempt ${this.callCount}`,
          retries: 0,
          validationErrors: [],
        };
      }
    }

    const responseData = {
      type: "module-summary",
      summary: `Analysis for: ${options.prompt.slice(0, 50)}...`,
      keyFeatures: ["feature-a"],
      complexity: "medium" as const,
      evidence: [
        {
          filePath: "src/example.ts",
          lineStart: 1,
          lineEnd: 5,
          snippet: "export const x = 1;",
        },
      ],
    };

    return {
      taskId: `fake-${Date.now()}`,
      exitCode: 0,
      durationMs: 5,
      stdout: JSON.stringify(responseData),
      stderr: "",
      retries: 0,
      validationErrors: [],
    };
  }
}

export interface RunTaskOptions {
  prompt: string;
  repoIndexPath: string;
  inputArtifacts: string[];
  outputSchema: string;
  timeoutSeconds: number;
  retries?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runTaskWithRetry(
  provider: AgentProvider,
  options: RunTaskOptions
): Promise<TaskResult> {
  const maxRetries = options.retries ?? 1;
  const timeoutMs = options.timeoutSeconds * 1000;
  let lastResult: TaskResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();

    const taskPromise = provider.runTask({
      prompt: options.prompt,
      repoIndexPath: options.repoIndexPath,
      inputArtifacts: options.inputArtifacts,
      outputSchema: options.outputSchema,
      timeoutSeconds: options.timeoutSeconds,
    }).catch((err: unknown) => ({
      taskId: `error-${Date.now()}`,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      retries: 0,
      validationErrors: [],
    }));

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Task timed out after ${options.timeoutSeconds}s`)), timeoutMs);
    });

    try {
      const result = await Promise.race([taskPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      lastResult = {
        ...result,
        durationMs,
        retries: attempt,
      };

      if (result.exitCode === 0) {
        return lastResult;
      }

      // Exit code non-zero, will retry if attempts remain
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      lastResult = {
        taskId: `timeout-${Date.now()}`,
        exitCode: 1,
        durationMs,
        stdout: "",
        stderr: errorMsg,
        retries: attempt,
        validationErrors: [],
      };
    }

    if (attempt < maxRetries) {
      // Exponential backoff: 500ms, 1000ms, 2000ms, ...
      await sleep(500 * Math.pow(2, attempt));
    }
  }

  return lastResult!;
}

export class AgentRunner {
  private providers: AgentProvider[] = [];

  register(provider: AgentProvider): void {
    this.providers.push(provider);
  }

  async detectAgents(): Promise<DetectedAgent[]> {
    const results: DetectedAgent[] = [];
    for (const provider of this.providers) {
      const detected = await provider.detect();
      if (detected) results.push(detected);
    }
    return results;
  }

  async runTask(
    providerName: string,
    options: RunTaskOptions
  ): Promise<TaskResult> {
    const provider = this.providers.find((p) => p.name === providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }
    return runTaskWithRetry(provider, options);
  }

  async runTasksInParallel(
    providerName: string,
    tasks: Array<{ taskId: string; prompt: string; inputArtifacts: string[]; outputSchema: string }>,
    options: { timeoutSeconds: number; retries: number; concurrency: number }
  ): Promise<TaskResult[]> {
    const provider = this.providers.find((p) => p.name === providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }
    const resolvedProvider = provider;

    const results: TaskResult[] = new Array(tasks.length);
    const queue = tasks.map((task, index) => ({ ...task, index }));
    let nextIndex = 0;

    async function worker(): Promise<void> {
      while (nextIndex < queue.length) {
        const item = queue[nextIndex++];
        const result = await runTaskWithRetry(resolvedProvider, {
          prompt: item.prompt,
          repoIndexPath: "", // set by caller if needed
          inputArtifacts: item.inputArtifacts,
          outputSchema: item.outputSchema,
          timeoutSeconds: options.timeoutSeconds,
          retries: options.retries,
        });
        results[item.index] = result;
      }
    }

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(options.concurrency, tasks.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    return results;
  }
}
