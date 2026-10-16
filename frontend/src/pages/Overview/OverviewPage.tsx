import { useEffect, useState } from "react"
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
} from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import { api, AnalysisItem, RecommendationItem } from "../../api/client"

export default function OverviewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const analysisId = searchParams.get("id") || ""
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        let currentId = analysisId
        if (!currentId) {
          const all = await api.getAllAnalyses()
          if (all.length > 0) {
            currentId = all[0].id
          }
        }

        if (currentId) {
          const [ana, recs] = await Promise.all([
            api.getAnalysis(currentId),
            api.getRecommendations(currentId).catch(() => []),
          ])
          setAnalysis(ana)
          setRecommendations(recs)
        }
      } catch (err) {
        console.warn("Failed to load overview data from API:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [analysisId])

  const repoName = analysis?.repository?.name || "microsoft / git"
  const workloadName = analysis?.repository?.workload?.name || "Local development"
  const score = analysis?.optimization_score ?? 72

  // Metrics extraction helpers
  const getMetricValue = (type: string, fallback: string) => {
    if (!analysis?.metrics) return fallback
    const item = analysis.metrics.find((m) => m.metric_type === type)
    if (!item) return fallback
    if (type === "repo_size_mb") {
      return item.metric_value >= 1024
        ? `${(item.metric_value / 1024).toFixed(1)} GB`
        : `${Math.round(item.metric_value)} MB`
    }
    if (type === "largest_object_mb") {
      return item.metric_value >= 1024
        ? `${(item.metric_value / 1024).toFixed(1)} GB`
        : `${Math.round(item.metric_value)} MB`
    }
    if (type === "estimated_clone_min") {
      return `${Math.round(item.metric_value)} min`
    }
    if (item.metric_value >= 1000) {
      return `${Math.round(item.metric_value / 1000)}K`
    }
    return item.metric_value.toLocaleString()
  }

  const metricsGrid = [
    {
      label: "Repository size",
      value: getMetricValue("repo_size_mb", "32.4 GB"),
      hint: "Total packed and loose objects",
      Icon: Database,
    },
    {
      label: "Git objects",
      value: getMetricValue("git_objects_count", "2.1M"),
      hint: "Blobs, trees, commits & tags",
      Icon: Box,
    },
    {
      label: "Commits",
      value: getMetricValue("commit_count", "184K"),
      hint: "Historical depth",
      Icon: GitBranch,
    },
    {
      label: "Files",
      value: getMetricValue("file_count", "96.4K"),
      hint: "Tracked working tree files",
      Icon: FileCode2,
    },
    {
      label: "Largest object",
      value: getMetricValue("largest_object_mb", "1.8 GB"),
      hint: "models/model.bin",
      Icon: FileArchive,
    },
    {
      label: "Estimated clone",
      value: getMetricValue("estimated_clone_min", "28 min"),
      hint: "Full clone on 200 Mbps",
      Icon: Clock3,
    },
  ]

  // Distribution figures
  const distribution = analysis?.object_distribution || {
    blobs_mb: 28600,
    trees_mb: 2800,
    commits_mb: 812,
    tags_mb: 188,
  }

  const formatMb = (mb: number) => {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
  }

  const currentIdParam = analysis?.id ? `?id=${analysis.id}` : ""

  return (
    <div className="page">
      <div className="repository-header">
        <div>
          <div className="repo-name">
            <FolderGit2 size={20} />
            <h1>{repoName}</h1>
            <span>PUBLIC</span>
          </div>
          <p>
            Analyzed {analysis?.created_at ? new Date(analysis.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "today at 10:42"} · Workload: <b>{workloadName}</b>
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/analyze")}>
          <RefreshCw size={14} /> Re-analyze
        </Button>
      </div>

      <section className="health-summary">
        <div className="score">
          <strong>{score}</strong>
          <span>/ 100</span>
        </div>
        <div>
          <small>OPTIMIZATION OPPORTUNITY SCORE</small>
          <h2>{score >= 70 ? "Repository needs optimization" : "Repository well optimized"}</h2>
          <p>
            Supported Git strategies could meaningfully reduce setup time and
            local disk usage.
          </p>
        </div>
        <div className="health-action">
          <span className="warning-badge">{recommendations.length || 3} opportunities found</span>
          <Button onClick={() => navigate(`/recommendations${currentIdParam}`)}>
            View recommendations <ArrowRight size={14} />
          </Button>
        </div>
      </section>

      <div className="metrics-grid">
        {metricsGrid.map(({ label, value, hint, Icon }) => (
          <article className="metric-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={15} />
            </div>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>

      <div className="overview-grid">
        <section className="panel growth-panel">
          <div className="panel-heading">
            <div>
              <span>Repository growth</span>
              <small>Size over the last 24 months</small>
            </div>
            <b>+42%</b>
          </div>
          <div className="chart">
            <div className="y-axis">
              <span>32 GB</span>
              <span>24 GB</span>
              <span>16 GB</span>
              <span>8 GB</span>
            </div>
            <svg
              viewBox="0 0 600 180"
              preserveAspectRatio="none"
              aria-label="Repository size growth chart"
            >
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#6ee7b7" stopOpacity=".22" />
                  <stop offset="1" stopColor="#6ee7b7" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                className="chart-area"
                d="M0,155 C55,152 75,140 120,139 S180,125 225,126 S290,108 330,111 S390,84 435,87 S495,60 535,57 S575,24 600,28 L600,180 L0,180 Z"
              />
              <path
                className="chart-line"
                d="M0,155 C55,152 75,140 120,139 S180,125 225,126 S290,108 330,111 S390,84 435,87 S495,60 535,57 S575,24 600,28"
              />
            </svg>
            <div className="x-axis">
              <span>Oct 24</span>
              <span>Apr 25</span>
              <span>Oct 25</span>
              <span>Apr 26</span>
              <span>Oct 26</span>
            </div>
          </div>
        </section>

        <section className="panel distribution-panel">
          <div className="panel-heading">
            <div>
              <span>Object distribution</span>
              <small>{formatMb(distribution.blobs_mb + distribution.trees_mb + distribution.commits_mb + distribution.tags_mb)} total storage</small>
            </div>
          </div>
          <div className="distribution-body">
            <div className="donut">
              <div>
                <strong>88%</strong>
                <small>blobs</small>
              </div>
            </div>
            <div className="legend">
              {[
                ["Blobs", formatMb(distribution.blobs_mb), "green"],
                ["Trees", formatMb(distribution.trees_mb), "purple"],
                ["Commits", formatMb(distribution.commits_mb), "blue"],
                ["Tags", formatMb(distribution.tags_mb), "gray"],
              ].map(([label, value, color]) => (
                <div key={label}>
                  <span>
                    <i className={color} />
                    {label}
                  </span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="panel issues-panel">
        <div className="panel-heading">
          <div>
            <span>Detected issues</span>
            <small>Evidence connected to supported Git optimizations</small>
          </div>
          <button onClick={() => navigate(`/recommendations${currentIdParam}`)}>
            View all <ArrowRight size={13} />
          </button>
        </div>
        {recommendations.length > 0 ? (
          recommendations.map((rec) => (
            <div
              className="issue-row cursor-pointer"
              key={rec.recommendation_id}
              onClick={() => navigate(`/recommendations/${rec.recommendation_id}?analysisId=${analysis?.id || ""}`)}
            >
              <span className={`impact-tag ${rec.severity === "high" || rec.severity === "critical" ? "high" : ""}`}>
                {rec.severity.toUpperCase()} IMPACT
              </span>
              <div>
                <strong>{rec.title}</strong>
                <small>{rec.reasoning}</small>
              </div>
              <div className="issue-solution">
                <small>POTENTIAL OPTIMIZATION</small>
                <b>{rec.category.toUpperCase()}</b>
              </div>
              <ChevronRight size={16} />
            </div>
          ))
        ) : (
          [
            [
              "HIGH IMPACT",
              "Large blob dataset",
              "28.6 GB of blob content increases full clone cost.",
              "Partial clone",
            ],
            [
              "MEDIUM IMPACT",
              "Concentrated path activity",
              "82% of paths are rarely touched by most contributors.",
              "Sparse checkout",
            ],
            [
              "CONTEXTUAL",
              "Deep repository history",
              "CI only requires the latest commit for most builds.",
              "Shallow clone",
            ],
          ].map(([tag, title, detail, solution]) => (
            <div className="issue-row" key={title} onClick={() => navigate(`/recommendations${currentIdParam}`)}>
              <span className={`impact-tag ${tag === "HIGH IMPACT" ? "high" : ""}`}>
                {tag}
              </span>
              <div>
                <strong>{title}</strong>
                <small>{detail}</small>
              </div>
              <div className="issue-solution">
                <small>POTENTIAL OPTIMIZATION</small>
                <b>{solution}</b>
              </div>
              <ChevronRight size={16} />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
