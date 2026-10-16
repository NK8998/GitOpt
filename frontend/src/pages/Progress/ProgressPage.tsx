import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Check, Clock3, Loader2, Search, XCircle } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import { api, AnalysisItem } from "../../api/client"

const pipelineStages = [
  { key: "discovery", title: "Repository discovered", description: "Validated the repository source and analysis request" },
  { key: "metadata", title: "Metadata collected", description: "Collecting default branch and repository metadata" },
  { key: "metrics", title: "Repository metrics analyzed", description: "Counting files, commits, branches, and large objects" },
  { key: "recommendations", title: "Optimization evaluation", description: "Matching repository evidence to workload-specific Git strategies" },
  { key: "completed", title: "Analysis complete", description: "Metrics, recommendations, and export templates are ready" },
]

function formatMetric(type: string, value: number) {
  if (["repo_size_mb", "largest_object_mb", "current_tree_blob_mb"].includes(type)) {
    return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${value.toFixed(1)} MB`
  }
  if (type === "estimated_clone_min") return `${value.toFixed(1)} min`
  return value.toLocaleString()
}

export default function ProgressPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const analysisId = searchParams.get("id") || ""
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!analysisId) {
      setError("Missing analysis ID.")
      return
    }

    let cancelled = false
    let timer: number | undefined

    const refresh = async () => {
      try {
        const data = await api.getAnalysis(analysisId)
        if (cancelled) return
        setAnalysis(data)
        setError(null)
        if (data.status === "analyzing" || data.status === "pending") {
          timer = window.setTimeout(refresh, 1000)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch analysis progress")
      }
    }

    refresh()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [analysisId])

  const activeStageIndex = useMemo(() => {
    if (!analysis) return 0
    if (analysis.status === "completed") return pipelineStages.length - 1
    return Math.max(0, pipelineStages.findIndex((stage) => stage.key === analysis.current_stage))
  }, [analysis])

  const repoName = analysis?.repository?.name || "Repository"
  const done = analysis?.status === "completed"
  const failed = analysis?.status === "failed"
  const progress = analysis?.progress_percent ?? 0

  const metricTypes = [
    ["repo_size_mb", "Repository size"],
    ["git_objects_count", "Observed Git objects"],
    ["commit_count", "Commits"],
    ["file_count", "Files in default tree"],
    ["large_file_count", "Large files (≥10 MB)"],
  ] as const

  return (
    <div className="page progress-page">
      <div className="progress-heading">
        <div className={`analysis-pulse ${done ? "complete" : ""}`}>
          {failed ? <XCircle size={21} /> : done ? <Check size={21} /> : <Search size={21} />}
        </div>
        <div>
          <div className="eyebrow">{failed ? "ANALYSIS FAILED" : done ? "ANALYSIS COMPLETE" : "ANALYSIS IN PROGRESS"}</div>
          <h1>{done ? `Repository analyzed: ${repoName}` : `Analyzing ${repoName}`}</h1>
          <p>
            {failed
              ? "GitOpt could not complete this analysis. Review the repository URL, GitHub access, and backend logs."
              : done
                ? "Repository evidence has been collected and matched to workload-specific optimization rules."
                : "GitOpt is building an evidence-based repository performance profile."}
          </p>
        </div>
      </div>

      {error && <div className="panel" style={{ padding: 16, marginBottom: 20, color: "#f87171" }}>{error}</div>}

      <div className="progress-layout">
        <div className="pipeline-card">
          <div className="card-heading"><span>Analysis pipeline</span><b>{progress}%</b></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="pipeline">
            {pipelineStages.map((stage, index) => {
              const state = done || index < activeStageIndex ? "done" : index === activeStageIndex ? "active" : "waiting"
              return (
                <div className={`pipeline-row ${state}`} key={stage.key}>
                  <div className="stage-marker">{state === "done" ? <Check size={13} /> : <span />}</div>
                  <div><strong>{stage.title}</strong><small>{stage.description}</small></div>
                  {state === "active" && !failed && <span className="scanning"><Loader2 size={11} className="animate-spin" /> WORKING</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="live-metrics">
          <div className="card-heading">
            <span>Collected metrics</span>
            <i><span /> {analysis?.metric_source === "git_cli" ? "GIT CLI" : analysis?.metric_source === "github_api" ? "GITHUB API" : "LIVE"}</i>
          </div>
          {metricTypes.map(([type, label]) => {
            const metric = analysis?.metrics?.find((item) => item.metric_type === type)
            return (
              <div key={type}>
                <span>{label}</span>
                <strong>{metric ? formatMetric(type, metric.metric_value) : "—"}</strong>
              </div>
            )
          })}
        </div>
      </div>

      <div className="progress-footer">
        <p><Clock3 size={15} /> Progress and metrics shown here come from the backend analysis record.</p>
        {done && (
          <Button onClick={() => navigate(`/overview?id=${analysisId}`)}>
            View analysis <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </div>
  )
}
