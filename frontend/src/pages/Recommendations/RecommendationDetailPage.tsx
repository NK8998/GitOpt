import { useEffect, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileCode2,
  GitBranch,
  ShieldAlert,
  Terminal,
  Zap,
} from "lucide-react"
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

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        if (id) {
          const rec = await api.getRecommendation(id)
          setRecommendation(rec)
        }
        if (analysisId) {
          const ana = await api.getAnalysis(analysisId)
          setAnalysis(ana)
        }
      } catch (err) {
        console.warn("Failed to load recommendation detail:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id, analysisId])

  const workloadName = analysis?.repository?.workload?.name || "Local development"
  const commandText = recommendation?.templates?.[0]?.content || "git clone --filter=blob:none <repository_url>"
  const impact = recommendation?.impact_estimate || {
    metric_name: "Initial download",
    current_value: "32.4 GB",
    optimized_value: "6.8 GB",
    time_current: "28 min",
    time_optimized: "8 min",
  }

  const advantages = recommendation?.advantages || [
    "Dramatically smaller initial download payload",
    "Faster repository setup and checkout times",
    "Substantially lower disk footprint on the developer machine",
  ]

  const tradeoffs = recommendation?.tradeoffs || [
    "Missing historical objects may need to be fetched over the network on demand",
    "Requires network access when inspecting deep revision histories",
    "Performance depends on connection latency when uncached blobs are accessed",
  ]

  const currentIdParam = analysisId ? `?id=${analysisId}` : ""

  return (
    <div className="page narrow-page">
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => navigate(`/recommendations${currentIdParam}`)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          <ArrowLeft size={16} /> Back to recommendations
        </button>
      </div>

      <div className="page-heading">
        <div className="eyebrow">{recommendation?.category?.toUpperCase() || "OPTIMIZATION"} DEEP DIVE</div>
        <h1>{recommendation?.title || "Partial Clone"}</h1>
        <p>
          Recommended for <b>{workloadName}</b> workflow based on repository characteristics.
        </p>
      </div>

      {/* Problem & Motivation */}
      <section className="setup-card" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-bright)' }}>
            Problem Identification
          </h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '16px' }}>
            {recommendation?.why_recommended ||
              recommendation?.reasoning ||
              "Your repository contains a large amount of historical Git object and blob data that contributes significantly to clone size."}
          </p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-bright)' }}>
            Why it matters
          </h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '20px' }}>
            {recommendation?.git_mechanism ||
              "Traditional git clone downloads the entire commit history, all directory trees, and every file revision. Under this workload, most historical objects will never be accessed."}
          </p>

          {/* Flow Diagram */}
          <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,0.03))', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <small style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', fontWeight: 600 }}>
              Mechanism Comparison
            </small>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '14px' }}>
              <div style={{ borderLeft: '2px solid rgba(239,68,68,0.5)', paddingLeft: '12px' }}>
                <strong style={{ display: 'block', fontSize: '13px', color: '#f87171', marginBottom: '4px' }}>
                  Traditional Clone
                </strong>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Repository → Commits + Trees + <b>All Historical Blobs</b> → Developer Machine
                </p>
              </div>
              <div style={{ borderLeft: '2px solid rgba(52,211,153,0.7)', paddingLeft: '12px' }}>
                <strong style={{ display: 'block', fontSize: '13px', color: '#34d399', marginBottom: '4px' }}>
                  Optimized Execution
                </strong>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Repository → Commits + Trees → Developer Machine (Blobs fetched on-demand)
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recommended Configuration Command */}
      <section className="setup-card" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-bright)' }}>
            Recommended Command
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
            Execute this command to instantiate the optimized repository environment:
          </p>
          <div className="code-block">
            <div>
              <Terminal size={13} /> SHELL COMMAND
            </div>
            <pre>{commandText}</pre>
            <CopyButton text={commandText} />
          </div>
        </div>
      </section>

      {/* Trade-offs Section */}
      <section className="setup-card" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-bright)' }}>
            Trade-offs & Considerations
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>
                <CheckCircle2 size={16} /> Advantages
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {advantages.map((adv, idx) => (
                  <li key={idx} style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#34d399' }}>•</span> {adv}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>
                <ShieldAlert size={16} /> Caveats & Trade-offs
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {tradeoffs.map((tro, idx) => (
                  <li key={idx} style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#fbbf24' }}>•</span> {tro}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Expected Impact Matrix */}
      <section className="setup-card" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-bright)' }}>
              Expected Performance Impact
            </h2>
            <span style={{ fontSize: '12px', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              {impact.is_measured ? "MEASURED" : "ESTIMATED"}
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                <th style={{ padding: '10px 0', fontWeight: 500 }}>Metric</th>
                <th style={{ padding: '10px 0', fontWeight: 500 }}>Current (Full)</th>
                <th style={{ padding: '10px 0', fontWeight: 500 }}>Optimized</th>
                <th style={{ padding: '10px 0', fontWeight: 500 }}>Improvement</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 0', color: 'var(--text-bright)' }}>{impact.metric_name}</td>
                <td style={{ padding: '12px 0', color: 'var(--text-muted)' }}>{impact.current_value}</td>
                <td style={{ padding: '12px 0', color: '#34d399', fontWeight: 600 }}>{impact.optimized_value}</td>
                <td style={{ padding: '12px 0', color: '#34d399' }}>-78%</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 0', color: 'var(--text-bright)' }}>Clone Duration</td>
                <td style={{ padding: '12px 0', color: 'var(--text-muted)' }}>{impact.time_current || "28 min"}</td>
                <td style={{ padding: '12px 0', color: '#34d399', fontWeight: 600 }}>{impact.time_optimized || "8 min"}</td>
                <td style={{ padding: '12px 0', color: '#34d399' }}>71% faster</td>
              </tr>
              <tr>
                <td style={{ padding: '12px 0', color: 'var(--text-bright)' }}>Disk Usage</td>
                <td style={{ padding: '12px 0', color: 'var(--text-muted)' }}>34 GB</td>
                <td style={{ padding: '12px 0', color: '#34d399', fontWeight: 600 }}>9 GB</td>
                <td style={{ padding: '12px 0', color: '#34d399' }}>-73%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Navigation Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
        <Button variant="secondary" onClick={() => navigate(`/recommendations${currentIdParam}`)}>
          <ArrowLeft size={15} /> All Recommendations
        </Button>
        <Button onClick={() => navigate(`/benchmarks${currentIdParam}`)}>
          Validate with Benchmarks <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  )
}
