import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Box,
  ChevronRight,
  Clock3,
  Database,
  FileArchive,
  FileCode2,
  FolderGit2,
  GitBranch,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import { api, AnalysisItem, RecommendationItem } from "../../api/client"

function formatMetric(type: string, value: number) {
  if (["repo_size_mb", "largest_object_mb", "current_tree_blob_mb"].includes(type)) {
    return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${value.toFixed(1)} MB`
  }
  if (type === "estimated_clone_min") return `${value.toFixed(1)} min`
  return value.toLocaleString()
}

export default function OverviewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedAnalysisId = searchParams.get("id") || ""
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        let currentId = requestedAnalysisId
        if (!currentId) {
          const all = await api.getAllAnalyses()
          currentId = all[0]?.id || ""
        }
        if (!currentId) throw new Error("No repository analysis exists yet.")

        const [ana, recs] = await Promise.all([
          api.getAnalysis(currentId),
          api.getRecommendations(currentId),
        ])
        setAnalysis(ana)
        setRecommendations(recs)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load repository analysis")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [requestedAnalysisId])

  const metricMap = useMemo(() => {
    return new Map((analysis?.metrics || []).map((metric) => [metric.metric_type, metric]))
  }, [analysis])

  const metricsGrid = [
    { type: "repo_size_mb", label: "Repository size", hint: "GitHub-reported object database size / local Git object size", Icon: Database },
    { type: "git_objects_count", label: "Observed Git objects", hint: "Evidence count from GitHub tree + commits or git count-objects", Icon: Box },
    { type: "commit_count", label: "Commits", hint: "Commit history depth on the analyzed branch", Icon: GitBranch },
    { type: "file_count", label: "Files", hint: "Tracked files in the current/default tree", Icon: FileCode2 },
    { type: "largest_object_mb", label: "Largest current file", hint: analysis?.largest_objects?.[0]?.path || "No current-tree object found", Icon: FileArchive },
    { type: "estimated_clone_min", label: "Estimated clone", hint: "Modelled estimate — not a benchmark measurement", Icon: Clock3 },
  ]

  if (loading) {
    return <div className="page"><div className="page-heading"><h1>Loading repository analysis…</h1></div></div>
  }

  if (error || !analysis) {
    return (
      <div className="page">
        <div className="page-heading"><h1>Analysis unavailable</h1><p>{error || "No analysis data was returned."}</p></div>
        <Button onClick={() => navigate("/analyze")}>Analyze a repository</Button>
      </div>
    )
  }

  const repoName = analysis.repository?.name || "Repository"
  const workloadName = analysis.repository?.workload?.name || "Unknown workload"
  const score = analysis.optimization_score ?? 0
  const currentIdParam = `?id=${analysis.id}`
  const measuredBlobMb = analysis.object_distribution?.blobs_mb || 0

  return (
    <div className="page">
      <div className="repository-header">
        <div>
          <div className="repo-name">
            <FolderGit2 size={20} />
            <h1>{repoName}</h1>
            <span>{analysis.repository?.source?.toUpperCase() || "REPOSITORY"}</span>
          </div>
          <p>
            Analyzed {new Date(analysis.created_at).toLocaleString()} · Workload: <b>{workloadName}</b>
            {analysis.default_branch ? <> · Branch: <b>{analysis.default_branch}</b></> : null}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/analyze")}><RefreshCw size={14} /> Re-analyze</Button>
      </div>

      <section className="health-summary">
        <div className="score"><strong>{score}</strong><span>/ 100</span></div>
        <div>
          <small>OPTIMIZATION OPPORTUNITY SCORE</small>
          <h2>{score >= 70 ? "High optimization opportunity" : score >= 40 ? "Moderate optimization opportunity" : "Low optimization opportunity"}</h2>
          <p>This heuristic score summarizes repository size, history depth, file count, and large-file evidence. Use the underlying metrics and recommendations for decisions.</p>
        </div>
        <div className="health-action">
          <span className="warning-badge">{recommendations.length} recommendation{recommendations.length === 1 ? "" : "s"} matched</span>
          <Button onClick={() => navigate(`/recommendations${currentIdParam}`)}>View recommendations <ArrowRight size={14} /></Button>
        </div>
      </section>

      <div className="metrics-grid">
        {metricsGrid.map(({ type, label, hint, Icon }) => {
          const metric = metricMap.get(type)
          return (
            <article className="metric-card" key={type}>
              <div><span>{label}</span><Icon size={15} /></div>
              <strong>{metric ? formatMetric(type, metric.metric_value) : "—"}</strong>
              <small>{hint}</small>
            </article>
          )
        })}
      </div>

      <div className="overview-grid">
        <section className="panel growth-panel">
          <div className="panel-heading">
            <div><span>Evidence provenance</span><small>What GitOpt actually observed during this run</small></div>
            <b>{analysis.metric_source === "github_api" ? "GitHub API" : analysis.metric_source === "git_cli" ? "Git CLI" : analysis.metric_source || "Unknown"}</b>
          </div>
          <div style={{ padding: "8px 20px 20px" }}>
            {(analysis.metric_notes || []).map((note) => (
              <p key={note} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55 }}>
                <ShieldCheck size={15} style={{ flex: "0 0 auto", marginTop: 2 }} /> {note}
              </p>
            ))}
            {!analysis.metric_notes?.length && <p>No provenance notes were supplied for this analysis.</p>}
            {analysis.tree_truncated && <p style={{ color: "#fbbf24" }}>GitHub truncated the recursive tree response; file-related metrics are lower bounds.</p>}
          </div>
        </section>

        <section className="panel distribution-panel">
          <div className="panel-heading">
            <div><span>Current-tree payload</span><small>Observed file content represented by the analyzed checkout/tree</small></div>
          </div>
          <div className="distribution-body">
            <div className="donut"><div><strong>{measuredBlobMb >= 1024 ? `${(measuredBlobMb / 1024).toFixed(1)} GB` : `${measuredBlobMb.toFixed(1)} MB`}</strong><small>tracked files</small></div></div>
            <div className="legend">
              <div><span><i className="green" />Current tree blobs</span><b>{measuredBlobMb >= 1024 ? `${(measuredBlobMb / 1024).toFixed(1)} GB` : `${measuredBlobMb.toFixed(1)} MB`}</b></div>
              <div><span><i className="gray" />Historical object mix</span><b>Not inferred</b></div>
            </div>
          </div>
        </section>
      </div>

      {analysis.largest_objects?.length ? (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-heading"><div><span>Largest files in analyzed tree</span><small>Useful evidence for large-object and partial-clone recommendations</small></div></div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th style={{ textAlign: "left", padding: 12 }}>Path</th><th style={{ textAlign: "right", padding: 12 }}>Size</th><th style={{ textAlign: "left", padding: 12 }}>Type</th></tr></thead>
              <tbody>{analysis.largest_objects.slice(0, 8).map((object) => (
                <tr key={`${object.path}-${object.size_mb}`} style={{ borderTop: "1px solid var(--border)" }}><td style={{ padding: 12 }}>{object.path}</td><td style={{ padding: 12, textAlign: "right" }}>{formatMetric("largest_object_mb", object.size_mb)}</td><td style={{ padding: 12 }}>{object.type}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel issues-panel">
        <div className="panel-heading">
          <div><span>Detected optimization opportunities</span><small>Rules matched against repository evidence and the selected workload</small></div>
          <button onClick={() => navigate(`/recommendations${currentIdParam}`)}>View all <ArrowRight size={13} /></button>
        </div>
        {recommendations.length ? recommendations.slice(0, 5).map((rec) => (
          <div className="issue-row cursor-pointer" key={rec.recommendation_id} onClick={() => navigate(`/recommendations/${rec.recommendation_id}?analysisId=${analysis.id}`)}>
            <span className={`impact-tag ${rec.severity === "high" || rec.severity === "critical" ? "high" : ""}`}>{rec.severity.toUpperCase()} IMPACT</span>
            <div><strong>{rec.title}</strong><small>{rec.reasoning}</small></div>
            <div className="issue-solution"><small>CONFIDENCE</small><b>{Math.round(rec.relevance_score * 100)}%</b></div>
            <ChevronRight size={16} />
          </div>
        )) : <div style={{ padding: 20 }}>No optimization rules matched this repository/workload combination.</div>}
      </section>
    </div>
  )
}
