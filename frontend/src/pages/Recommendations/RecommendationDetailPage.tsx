import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldAlert, Terminal } from "lucide-react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import CopyButton from "../../components/common/CopyButton"
import { api, AnalysisItem, RecommendationItem } from "../../api/client"

export default function RecommendationDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const analysisId = searchParams.get("analysisId") || ""
  const [recommendation, setRecommendation] = useState<RecommendationItem | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        if (!analysisId) throw new Error("Recommendation details require an analysis ID.")
        const [ana, recs] = await Promise.all([
          api.getAnalysis(analysisId),
          api.getRecommendations(analysisId),
        ])
        const rec = recs.find((item) => item.recommendation_id === id)
        if (!rec) throw new Error("This recommendation is not attached to the selected analysis.")
        setAnalysis(ana)
        setRecommendation(rec)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recommendation detail")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id, analysisId])

  if (loading) return <div className="page narrow-page"><div className="page-heading"><h1>Loading recommendation…</h1></div></div>
  if (error || !recommendation || !analysis) {
    return <div className="page narrow-page"><div className="page-heading"><h1>Recommendation unavailable</h1><p>{error || "No recommendation data was returned."}</p></div></div>
  }

  const workloadName = analysis.repository?.workload?.name || "Unknown workload"
  const commandText = recommendation.templates?.[0]?.content
  const impact = recommendation.impact_estimate
  const advantages = recommendation.advantages || []
  const tradeoffs = recommendation.tradeoffs || []
  const currentIdParam = `?id=${analysisId}`

  return (
    <div className="page narrow-page">
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => navigate(`/recommendations${currentIdParam}`)} style={{ background: "none", border: "none", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <ArrowLeft size={16} /> Back to recommendations
        </button>
      </div>

      <div className="page-heading">
        <div className="eyebrow">{recommendation.category.toUpperCase()} DEEP DIVE</div>
        <h1>{recommendation.title}</h1>
        <p>Recommended for <b>{workloadName}</b> with {Math.round(recommendation.relevance_score * 100)}% rule relevance.</p>
      </div>

      <section className="setup-card" style={{ marginBottom: 24 }}>
        <div style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--text-bright)" }}>Why this rule matched</h2>
          <p style={{ color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>{recommendation.why_recommended || recommendation.reasoning}</p>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--text-bright)" }}>Git mechanism</h3>
          <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>{recommendation.git_mechanism || recommendation.description}</p>
        </div>
      </section>

      <section className="setup-card" style={{ marginBottom: 24 }}>
        <div style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--text-bright)" }}>Generated templates</h2>
          {recommendation.templates.length ? recommendation.templates.map((template) => (
            <div className="code-block" key={template.id} style={{ marginTop: 14 }}>
              <div><Terminal size={13} /> {template.title.toUpperCase()}</div>
              <pre>{template.content}</pre>
              <CopyButton text={template.content} />
            </div>
          )) : <p>No command or Git config template is required for this recommendation.</p>}
        </div>
      </section>

      <section className="setup-card" style={{ marginBottom: 24 }}>
        <div style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "var(--text-bright)" }}>Trade-offs & considerations</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#34d399", marginBottom: 12, fontWeight: 600, fontSize: 14 }}><CheckCircle2 size={16} /> Advantages</div>
              {advantages.length ? <ul style={{ paddingLeft: 18 }}>{advantages.map((item) => <li key={item} style={{ color: "var(--text-muted)", marginBottom: 8 }}>{item}</li>)}</ul> : <p>No advantage notes supplied.</p>}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fbbf24", marginBottom: 12, fontWeight: 600, fontSize: 14 }}><ShieldAlert size={16} /> Caveats</div>
              {tradeoffs.length ? <ul style={{ paddingLeft: 18 }}>{tradeoffs.map((item) => <li key={item} style={{ color: "var(--text-muted)", marginBottom: 8 }}>{item}</li>)}</ul> : <p>No caveat notes supplied.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="setup-card" style={{ marginBottom: 24 }}>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--text-bright)" }}>Expected performance impact</h2>
            {impact && <span style={{ fontSize: 12, color: "#60a5fa", background: "rgba(96,165,250,0.1)", padding: "2px 8px", borderRadius: 4 }}>{impact.is_measured ? "MEASURED" : "ESTIMATED"}</span>}
          </div>
          {impact ? (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-dim)" }}><th style={{ padding: "10px 0" }}>Metric</th><th>Current</th><th>Optimized</th></tr></thead>
              <tbody>
                <tr><td style={{ padding: "12px 0" }}>{impact.metric_name}</td><td>{impact.current_value}</td><td style={{ color: "#34d399", fontWeight: 600 }}>{impact.optimized_value}</td></tr>
                {(impact.time_current || impact.time_optimized) && <tr style={{ borderTop: "1px solid var(--border)" }}><td style={{ padding: "12px 0" }}>Operation time</td><td>{impact.time_current || "—"}</td><td style={{ color: "#34d399", fontWeight: 600 }}>{impact.time_optimized || "—"}</td></tr>}
              </tbody>
            </table>
          ) : <p>No quantitative impact estimate is available for this recommendation.</p>}
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <Button variant="secondary" onClick={() => navigate(`/recommendations${currentIdParam}`)}><ArrowLeft size={15} /> All recommendations</Button>
        <Button onClick={() => navigate(`/configuration${currentIdParam}`)}>Download configuration <ArrowRight size={15} /></Button>
      </div>
    </div>
  )
}
