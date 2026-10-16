import { useEffect, useState } from "react"
import { ArrowRight, BarChart3, CheckCircle2, ChevronRight, Terminal } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import CopyButton from "../../components/common/CopyButton"
import { api, AnalysisItem, RecommendationItem } from "../../api/client"

function formatRepositorySize(analysis: AnalysisItem | null) {
  const metric = analysis?.metrics?.find((item) => item.metric_type === "repo_size_mb")
  if (!metric) return "Repository size unavailable"
  return metric.metric_value >= 1024
    ? `${(metric.metric_value / 1024).toFixed(1)} GB repository`
    : `${metric.metric_value.toFixed(1)} MB repository`
}

export default function RecommendationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedAnalysisId = searchParams.get("id") || ""
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [items, setItems] = useState<RecommendationItem[]>([])
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
        setItems(recs)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recommendations")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [requestedAnalysisId])

  if (loading) return <div className="page"><div className="page-heading"><h1>Loading recommendations…</h1></div></div>
  if (error || !analysis) {
    return <div className="page"><div className="page-heading"><h1>Recommendations unavailable</h1><p>{error || "No analysis was returned."}</p></div></div>
  }

  const workloadName = analysis.repository?.workload?.name || "Unknown workload"
  const shortId = analysis.id.slice(0, 8).toUpperCase()
  const currentIdParam = `?id=${analysis.id}`
  const bestFit = items[0]?.title || "No rule matched"

  return (
    <div className="page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">EVIDENCE-BASED</div>
          <h1>Optimization recommendations</h1>
          <p>Deterministic Git optimization rules matched against repository characteristics and the <b>{workloadName}</b> workload.</p>
        </div>
        <span className="analysis-id">ANALYSIS ID&nbsp; {shortId}</span>
      </div>

      <div className="evidence-chain">
        {[
          ["OBSERVED", formatRepositorySize(analysis)],
          ["WORKLOAD", workloadName],
          ["EVALUATION", `${items.length} matching rule${items.length === 1 ? "" : "s"}`],
          ["BEST FIT", bestFit],
        ].map(([label, value], index) => (
          <div key={label}>
            <span><small>{label}</small><strong>{value}</strong></span>
            {index < 3 && <ArrowRight size={15} />}
          </div>
        ))}
      </div>

      <div className="recommendation-list">
        {items.length === 0 ? (
          <section className="panel" style={{ padding: 24 }}>
            <h2>No optimization rule matched</h2>
            <p>GitOpt did not find enough evidence to recommend one of the currently supported strategies for this repository and workload. This is preferable to recommending an optimization without evidence.</p>
          </section>
        ) : items.map((item, index) => {
          const numberStr = (index + 1).toString().padStart(2, "0")
          const commandText = item.templates?.[0]?.content
          const impact = item.impact_estimate

          return (
            <article className="recommendation-card" key={item.recommendation_id}>
              <div className="recommendation-number">{numberStr}</div>
              <div className="recommendation-main">
                <div className="recommendation-title">
                  <div>
                    <span className={item.severity === "critical" || item.severity === "high" ? "impact-tag high" : "impact-tag"}>{item.severity.toUpperCase()} IMPACT</span>
                    <h2>{item.title}</h2>
                  </div>
                  <span className="confidence"><CheckCircle2 size={13} /> Confidence {Math.round(item.relevance_score * 100)}%</span>
                </div>
                <div className="why">
                  <small>WHY THIS WAS RECOMMENDED</small>
                  <p>{item.why_recommended || item.reasoning}</p>
                </div>
                <div className="benefit-command">
                  <div className="benefit">
                    <small>{impact?.is_measured ? "BENEFIT · MEASURED" : "POTENTIAL BENEFIT · ESTIMATED"}</small>
                    {impact ? (
                      <>
                        <span>{impact.metric_name}</span>
                        <strong>{impact.current_value} <ArrowRight size={15} /> <em>{impact.optimized_value}</em></strong>
                      </>
                    ) : <span>No impact estimate supplied by this rule.</span>}
                    <div style={{ marginTop: 12 }}>
                      <Button variant="secondary" onClick={() => navigate(`/recommendations/${item.recommendation_id}?analysisId=${analysis.id}`)}>
                        View details <ChevronRight size={13} />
                      </Button>
                    </div>
                  </div>
                  <div className="code-block">
                    <div><Terminal size={13} /> GENERATED TEMPLATE</div>
                    {commandText ? <><pre>{commandText}</pre><CopyButton text={commandText} /></> : <pre>No shell template for this recommendation.</pre>}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <div className="recommendation-footer">
        <div><BarChart3 size={19} /><span><strong>Review modelled strategy impact</strong><small>Strategy comparisons are estimates until GitOpt runs isolated Git operations and records measurements.</small></span></div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={() => navigate(`/configuration${currentIdParam}`)}>Download templates</Button>
          <Button onClick={() => navigate(`/benchmarks${currentIdParam}`)}>View estimates <ArrowRight size={15} /></Button>
        </div>
      </div>
    </div>
  )
}
