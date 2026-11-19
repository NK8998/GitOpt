import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router";
import Button from "../../components/common/Button";
import { api } from "../../api/client";
import type { AnalysisItem, BenchmarkComparison } from "../../api/client";
import { useRepository } from "../../context/RepositoryContext";
import LiveScalarWorkspace from "./LiveScalarWorkspace";
import { CheckoutScopeAnalysis, ReferenceMethodology, RepositoryHeader, RepositoryMetrics } from "./RepositoryReference";
import StrategyComparison, { StrategyRecommendation } from "./StrategyComparison";
import "./benchmarks.css";

export default function BenchmarksPage() {
  const [searchParams] = useSearchParams();
  const { setCurrentRepository } = useRepository();
  const requestedAnalysisId = searchParams.get("id") || "";
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkComparison | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError(null);
      setRecalculateError(null);
      try {
        let currentId = requestedAnalysisId;
        if (!currentId) {
          const analyses = await api.getAllAnalyses();
          currentId = analyses[0]?.id || "";
        }
        if (!currentId) throw new Error("Run a repository analysis before comparing strategies.");

        const [currentAnalysis, comparison] = await Promise.all([
          api.getAnalysis(currentId),
          api.getBenchmarks(currentId, true),
        ]);
        if (cancelled) return;
        setAnalysis(currentAnalysis);
        setBenchmarks(comparison);
        if (currentAnalysis.repository) setCurrentRepository(currentAnalysis.repository);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load the strategy comparison.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [requestedAnalysisId, retry, setCurrentRepository]);

  async function recalculate() {
    if (!analysis) return;
    setRunning(true);
    setRecalculateError(null);
    try {
      const updated = await api.runBenchmarks(analysis.id);
      setBenchmarks((previous) => previous?.analysis_id === updated.analysis_id
        ? { ...updated, ultra_large: previous.ultra_large }
        : previous);
    } catch (cause) {
      setRecalculateError(cause instanceof Error ? cause.message : "Unable to recalculate the strategy estimates.");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="page benchmarks-page">
        <div className="panel benchmark-page-state" role="status"><Loader2 className="animate-spin" size={19} aria-hidden="true" /> Loading strategy comparison…</div>
      </div>
    );
  }
  if (error || !analysis || !benchmarks) {
    return (
      <div className="page benchmarks-page">
        <div className="panel benchmark-page-state benchmark-page-error" role="alert">
          <AlertCircle size={21} aria-hidden="true" />
          <div><h1>Strategy comparison unavailable</h1><p>{error ?? "No benchmark estimate was returned."}</p></div>
          <Button variant="secondary" onClick={() => setRetry((count) => count + 1)}>Retry</Button>
        </div>
      </div>
    );
  }

  const reference = benchmarks.ultra_large;
  return (
    <div className="page benchmarks-page">
      <RepositoryHeader analysis={analysis} reference={reference} />
      {reference && <RepositoryMetrics reference={reference} />}
      <CheckoutScopeAnalysis reference={reference} />
      {recalculateError && <p className="panel benchmark-notice benchmark-error-text" role="alert">{recalculateError}</p>}
      <StrategyComparison
        key={`strategies-${analysis.id}`}
        comparison={benchmarks}
        repository={analysis.repository?.name ?? "Selected repository"}
        workload={analysis.repository?.workload?.name}
        running={running}
        onRecalculate={recalculate}
      />
      <StrategyRecommendation key={`recommendation-${analysis.id}`} comparison={benchmarks} analysisId={analysis.id} />
      <LiveScalarWorkspace key={`workspace-${analysis.id}`} analysis={analysis} />
      <ReferenceMethodology reference={reference} modelMethodology={benchmarks.methodology} />
    </div>
  );
}
