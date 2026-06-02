import type { AgentProvider, TaskResult, DetectedAgent } from "./types.js";

export class FakeProvider implements AgentProvider {
  name = "fake";

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
    return {
      taskId: `fake-${Date.now()}`,
      exitCode: 0,
      durationMs: 0,
      stdout: `Fake response for: ${options.prompt.slice(0, 50)}...`,
      stderr: "",
      retries: 0,
      validationErrors: [],
    };
  }
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
    options: {
      prompt: string;
      repoIndexPath: string;
      inputArtifacts: string[];
      outputSchema: string;
      timeoutSeconds: number;
    }
  ): Promise<TaskResult> {
    const provider = this.providers.find((p) => p.name === providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }
    return provider.runTask(options);
  }
}
