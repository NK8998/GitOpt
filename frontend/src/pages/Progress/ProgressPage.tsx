import { useEffect, useState } from "react"
import { ArrowRight, Check, Clock3, Search } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import { api, AnalysisItem } from "../../api/client"

export default function ProgressPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const analysisId = searchParams.get("id") || ""
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [step, setStep] = useState(0)

  const repoName = analysis?.repository?.name || "Repository"

  const stages = [
    ["Repository discovered", `Connected to ${analysis?.repository?.url_path || "Git remote"}`],
    ["Metadata collected", "Default branch, refs, and repository configuration"],
    ["Git objects analyzed", `${analysis?.metrics?.find(m => m.metric_type === 'git_objects_count')?.metric_value?.toLocaleString() || "2.1M"} objects analyzed`],
    ["History analysis", `Scanning ${analysis?.metrics?.find(m => m.metric_type === 'commit_count')?.metric_value?.toLocaleString() || "184,293"} commits`],
    ["Workload analysis", `Matching ${analysis?.repository?.workload?.name || "local development"} patterns`],
    ["Optimization evaluation", "Testing supported Git strategies"],
  ]

  useEffect(() => {
    if (analysisId) {
      api.getAnalysis(analysisId)
        .then((data) => setAnalysis(data))
        .catch((err) => console.warn("Failed to fetch analysis details:", err))
    }
  }, [analysisId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((val) => {
        if (val < stages.length) return val + 1
        return val
      })
    }, 700)
    return () => window.clearInterval(timer)
  }, [stages.length])

  const done = step >= stages.length

  // Extract live metrics for display cards
  const getMetric = (type: string, fallback: string) => {
    if (!analysis?.metrics) return fallback
    const item = analysis.metrics.find((m) => m.metric_type === type)
    if (!item) return fallback
    if (type === "repo_size_mb") {
      return item.metric_value >= 1024
        ? `${(item.metric_value / 1024).toFixed(1)} GB`
        : `${Math.round(item.metric_value)} MB`
    }
    return item.metric_value.toLocaleString()
  }

  const liveMetrics = [
    ["Repository size", getMetric("repo_size_mb", "32.4 GB")],
    ["Git objects", getMetric("git_objects_count", "2,108,493")],
    ["Commits", getMetric("commit_count", "184,293")],
    ["Files", getMetric("file_count", "96,420")],
    ["Large objects", getMetric("large_file_count", "1,284")],
  ]

  return (
    <div className="page progress-page">
      <div className="progress-heading">
        <div className={`analysis-pulse ${done ? "complete" : ""}`}>
          <Search size={21} />
        </div>
        <div>
          <div className="eyebrow">
            {done ? "ANALYSIS COMPLETE" : "ANALYSIS IN PROGRESS"}
          </div>
          <h1>{done ? `Repository analyzed: ${repoName}` : `Analyzing ${repoName}`}</h1>
          <p>
            {done
              ? "We found opportunities to meaningfully improve repository performance."
              : "Building an evidence-based repository performance profile."}
          </p>
        </div>
      </div>
      <div className="progress-layout">
        <div className="pipeline-card">
          <div className="card-heading">
            <span>Analysis pipeline</span>
            <b>{Math.round((step / stages.length) * 100)}%</b>
          </div>
          <div className="progress-track">
            <span style={{ width: `${(step / stages.length) * 100}%` }} />
          </div>
          <div className="pipeline">
            {stages.map(([title, text], index) => {
              const state =
                index < step ? "done" : index === step ? "active" : "waiting"
              return (
                <div className={`pipeline-row ${state}`} key={title}>
                  <div className="stage-marker">
                    {state === "done" ? <Check size={13} /> : <span />}
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </div>
                  {state === "active" && (
                    <span className="scanning">SCANNING</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div className="live-metrics">
          <div className="card-heading">
            <span>Live metrics</span>
            <i>
              <span /> LIVE
            </i>
          </div>
          {liveMetrics.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="progress-footer">
        <p>
          <Clock3 size={15} /> Large repositories may take several minutes. You
          can leave this page open.
        </p>
        {done && (
          <Button onClick={() => navigate(analysisId ? `/overview?id=${analysisId}` : "/overview")}>
            View analysis <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </div>
  )
}
