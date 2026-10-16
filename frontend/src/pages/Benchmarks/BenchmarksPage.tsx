import { useEffect, useState } from "react"
import { ArrowRight, RefreshCw, Terminal, Zap } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import { api, AnalysisItem, BenchmarkComparison } from "../../api/client"

export default function BenchmarksPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedAnalysisId = searchParams.get("id") || ""
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [benchmarks, setBenchmarks] = useState<BenchmarkComparison | null>(null)
  const [running, setRunning] = useState(false)
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
        if (!currentId) throw new Error("Run a repository analysis before comparing strategies.")

        const [ana, bench] = await Promise.all([
          api.getAnalysis(currentId),
          api.getBenchmarks(currentId),
        ])
        setAnalysis(ana)
        setBenchmarks(bench)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load strategy estimates")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [requestedAnalysisId])

  const handleRecalculate = async () => {
    if (!analysis?.id) return
    setRunning(true)
    try {
      setBenchmarks(await api.runBenchmarks(analysis.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate estimates")
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <div className="page"><div className="page-heading"><h1>Loading strategy comparison…</h1></div></div>
  if (error || !analysis || !benchmarks) {
    return <div className="page"><div className="page-heading"><h1>Strategy comparison unavailable</h1><p>{error || "No benchmark estimate was returned."}</p></div></div>
  }

  const repoName = analysis.repository?.name || "Repository"
  const workloadName = analysis.repository?.workload?.name || "selected"
  const currentIdParam = `?id=${analysis.id}`
  const strategies = benchmarks.strategies
  const chartSeries = benchmarks.chart_series

  return (
    <div className="page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">MODELLED STRATEGY COMPARISON</div>
          <h1>Optimization estimates</h1>
          <p>Estimated performance for <b>{repoName}</b> under a {workloadName.toLowerCase()} workload. These values are not measured Git operation timings.</p>
        </div>
        <Button variant="secondary" onClick={handleRecalculate} disabled={running}>
          <RefreshCw size={14} className={running ? "animate-spin" : ""} /> {running ? "Recalculating..." : "Recalculate estimates"}
        </Button>
      </div>

      <section className="panel" style={{ padding: 16, marginBottom: 20 }}>
        <strong>Methodology</strong>
        <p style={{ marginBottom: 0, color: "var(--text-muted)" }}>{benchmarks.methodology}</p>
      </section>

      <div className="benchmark-summary">
        <div className="winner-icon"><Zap size={21} /></div>
        <div>
          <small>BEST MODELLED STRATEGY FOR THIS WORKLOAD</small>
          <h2>{benchmarks.best_strategy}</h2>
          <p>Use this as a hypothesis to validate on a disposable clone, not as a measured benchmark result.</p>
        </div>
        <div className="saving">
          <small>ESTIMATED TIME SAVED</small>
          <strong>{benchmarks.estimated_time_saved}</strong>
          <span>{benchmarks.percent_faster}% faster (modelled)</span>
        </div>
      </div>

      <section className="panel benchmark-table">
        <div className="benchmark-row benchmark-head">
          <span>Strategy</span><span>Clone time</span><span>Data transferred</span><span>Disk usage</span><span>Relative time</span>
        </div>
        {strategies.map((row) => (
          <div className={`benchmark-row ${row.is_best ? "best" : ""}`} key={row.strategy}>
            <span><b>{row.strategy}</b>{row.is_best && <i>MODEL BEST</i>}</span>
            <span>{row.time}</span><span>{row.transfer}</span><span>{row.disk}</span>
            <span><i className="bar"><i style={{ width: `${row.relative_percent}%` }} /></i><small>{row.relative_percent}%</small></span>
          </div>
        ))}
      </section>

      <div className="benchmark-charts">
        {[
          ["Estimated clone time", "Minutes", chartSeries.clone_time_min],
          ["Estimated data transferred", "Gigabytes", chartSeries.data_transferred_gb],
          ["Estimated disk usage", "Gigabytes", chartSeries.disk_usage_gb],
        ].map(([title, unit, values]) => (
          <section className="panel mini-chart-card" key={String(title)}>
            <div className="panel-heading"><div><span>{String(title)}</span><small>{String(unit)}</small></div></div>
            <div className="vertical-bars">
              {(values as number[]).map((value, index) => {
                const max = Math.max(...(values as number[]), 1)
                return (
                  <div key={index}>
                    <span>{value}</span>
                    <i style={{ height: `${(value / max) * 100}%` }} className={strategies[index]?.is_best ? "best-bar" : ""} />
                    <small>{chartSeries.labels[index]}</small>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="apply-card">
        <div><Terminal size={20} /><span><strong>Ready to review the recommended configuration?</strong><small>Download commands and configuration templates generated from matched recommendations.</small></span></div>
        <Button onClick={() => navigate(`/configuration${currentIdParam}`)}>View configuration <ArrowRight size={15} /></Button>
      </div>
    </div>
  )
}
