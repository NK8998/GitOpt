import { useEffect, useState } from "react"
import { ArrowRight, BarChart3, CheckCircle2, ChevronRight, Terminal } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import CopyButton from "../../components/common/CopyButton"
import { api, AnalysisItem, RecommendationItem } from "../../api/client"

export default function RecommendationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const analysisId = searchParams.get("id") || ""
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [items, setItems] = useState<RecommendationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        let currentId = analysisId
        if (!currentId) {
          const all = await api.getAllAnalyses()
          if (all.length > 0) currentId = all[0].id
        }

        if (currentId) {
          const [ana, recs] = await Promise.all([
            api.getAnalysis(currentId),
            api.getRecommendations(currentId),
          ])
          setAnalysis(ana)
          setItems(recs)
        }
      } catch (err) {
        console.warn("Failed to load recommendations:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [analysisId])

  const workloadName = analysis?.repository?.workload?.name || "Local development"
  const shortId = (analysis?.id || "8C4F-21A").slice(0, 8).toUpperCase()
  const currentIdParam = analysis?.id ? `?id=${analysis.id}` : ""

  return (
    <div className="page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">EVIDENCE-BASED</div>
          <h1>Optimization recommendations</h1>
          <p>
            Based on repository characteristics and the <b>{workloadName}</b>{" "}
            workload.
          </p>
        </div>
        <span className="analysis-id">ANALYSIS ID&nbsp; {shortId}</span>
      </div>

      <div className="evidence-chain">
        {[
          ["OBSERVED", `${analysis?.metrics?.find(m => m.metric_type === 'repo_size_mb')?.metric_value ? (analysis.metrics.find(m => m.metric_type === 'repo_size_mb')!.metric_value / 1024).toFixed(1) + " GB" : "28.6 GB"} Git data`],
          ["WORKLOAD", workloadName],
          ["BOTTLENECK", "Expensive setup & clone time"],
          ["BEST FIT", items[0]?.title ? items[0].title.split('(')[0].trim() : "Partial clone"],
        ].map(([label, value], index) => (
          <div key={label}>
            <span>
              <small>{label}</small>
              <strong>{value}</strong>
            </span>
            {index < 3 && <ArrowRight size={15} />}
          </div>
        ))}
      </div>

      <div className="recommendation-list">
        {items.map((item, index) => {
          const numberStr = (index + 1).toString().padStart(2, "0")
          const commandText = item.templates?.[0]?.content || "git clone --filter=blob:none <repository_url>"
          const impact = item.impact_estimate || {
            metric_name: "Initial download",
            current_value: "32.4 GB",
            optimized_value: "6.8 GB",
          }

          return (
            <article className="recommendation-card" key={item.recommendation_id}>
              <div className="recommendation-number">{numberStr}</div>
              <div className="recommendation-main">
                <div className="recommendation-title">
                  <div>
                    <span
                      className={
                        item.severity === "critical" || item.severity === "high"
                          ? "impact-tag high"
                          : "impact-tag"
                      }
                    >
                      {item.severity.toUpperCase()} IMPACT
                    </span>
                    <h2>{item.title}</h2>
                  </div>
                  <span className="confidence">
                    <CheckCircle2 size={13} /> High confidence ({Math.round(item.relevance_score * 100)}%)
                  </span>
                </div>
                <div className="why">
                  <small>WHY THIS WAS RECOMMENDED</small>
                  <p>{item.why_recommended || item.reasoning || item.description}</p>
                </div>
                <div className="benefit-command">
                  <div className="benefit">
                    <small>POTENTIAL BENEFIT · ESTIMATED</small>
                    <span>{impact.metric_name}</span>
                    <strong>
                      {impact.current_value} <ArrowRight size={15} />{" "}
                      <em>{impact.optimized_value}</em>
                    </strong>
                    <div style={{ marginTop: '12px' }}>
                      <Button
                        variant="secondary"
                        onClick={() => navigate(`/recommendations/${item.recommendation_id}?analysisId=${analysis?.id || ""}`)}
                      >
                        View Details <ChevronRight size={13} />
                      </Button>
                    </div>
                  </div>
                  <div className="code-block">
                    <div>
                      <Terminal size={13} /> RECOMMENDED COMMAND
                    </div>
                    <pre>{commandText}</pre>
                    <CopyButton text={commandText} />
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <div className="recommendation-footer">
        <div>
          <BarChart3 size={19} />
          <span>
            <strong>Want to validate these estimates?</strong>
            <small>
              Compare supported Git strategies against the repository profile.
            </small>
          </span>
        </div>
        <Button onClick={() => navigate(`/benchmarks${currentIdParam}`)}>
          View benchmarks <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  )
}
