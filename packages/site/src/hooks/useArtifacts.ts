import { useEffect, useState } from "react";
import type {
  Snapshot,
  ArtifactEnvelope,
  OverviewData,
  ModulesData,
  FeaturesData,
  CodeMapData,
} from "../types.js";

interface Artifacts {
  snapshot: Snapshot | null;
  overview: OverviewData | null;
  modules: ModulesData | null;
  features: FeaturesData | null;
  codeMap: CodeMapData | null;
  loading: boolean;
  errors: string[];
}

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useArtifacts(): Artifacts {
  const [artifacts, setArtifacts] = useState<Artifacts>({
    snapshot: null,
    overview: null,
    modules: null,
    features: null,
    codeMap: null,
    loading: true,
    errors: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [snapshot, overviewEnv, modulesEnv, featuresEnv, codeMapEnv] =
        await Promise.all([
          loadJson<Snapshot>("./snapshot.json"),
          loadJson<ArtifactEnvelope<OverviewData>>("./artifacts/overview.json"),
          loadJson<ArtifactEnvelope<ModulesData>>("./artifacts/modules.json"),
          loadJson<ArtifactEnvelope<FeaturesData>>("./artifacts/features.json"),
          loadJson<ArtifactEnvelope<CodeMapData>>("./artifacts/code-map.json"),
        ]);

      if (cancelled) return;

      const errors: string[] = [];
      if (!snapshot) errors.push("Failed to load snapshot");
      if (!overviewEnv) errors.push("Failed to load overview artifact");
      if (!modulesEnv) errors.push("Failed to load modules artifact");

      setArtifacts({
        snapshot: snapshot ?? null,
        overview: overviewEnv?.data ?? null,
        modules: modulesEnv?.data ?? null,
        features: featuresEnv?.data ?? null,
        codeMap: codeMapEnv?.data ?? null,
        loading: false,
        errors,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return artifacts;
}
