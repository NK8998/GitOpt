import { useEffect, useState } from "react"
import { ArrowRight, Loader2, RefreshCw, Terminal, Zap } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import { api, AnalysisItem, BenchmarkComparison } from "../../api/client"

export default function BenchmarksPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const analysisId = searchParams.get("id") || ""
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [benchmarks, setBenchmarks] = useState<BenchmarkComparison | null>(null)
  const [running, setRunning] = useState(false)
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
          const [ana, bench] = await Promise.all([
            api.getAnalysis(currentId),
            api.getBenchmarks(currentId),
          ])
          setAnalysis(ana)
          setBenchmarks(bench)
        }
      } catch (err) {
        console.warn("Failed to load benchmarks:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [analysisId])

  const handleRunBenchmark = async () => {
    if (!analysis?.id) return
    setRunning(true)
    try {
      const updated = await api.runBenchmarks(analysis.id)
      setBenchmarks(updated)
    } catch (err) {
      console.error("Failed to rerun benchmarks:", err)
    } finally {
      setRunning(false)
    }
  }

  const repoName = analysis?.repository?.name || "microsoft/git"
  const workloadName = analysis?.repository?.workload?.name || "local development"
  const currentIdParam = analysis?.id ? `?id=${analysis.id}` : ""

  const strategies = benchmarks?.strategies || [
    { strategy: "Full clone", time: "28m 14s", transfer: "32.4 GB", disk: "34.1 GB", relative_percent: 100, is_best: false },
    { strategy: "Shallow clone", time: "12m 08s", transfer: "14.2 GB", disk: "15.3 GB", relative_percent: 43, is_best: false },
    { strategy: "Partial clone", time: "8m 21s", transfer: "6.8 GB", disk: "9.1 GB", relative_percent: 30, is_best: false },
    { strategy: "Partial + sparse", time: "6m 43s", transfer: "5.2 GB", disk: "6.7 GB", relative_percent: 24, is_best: true },
  ]

  const chartSeries = benchmarks?.chart_series || {
    clone_time_min: [28, 12, 8, 6],
    data_transferred_gb: [32, 14, 7, 5],
    disk_usage_gb: [34, 15, 9, 7],
    labels: ["Full", "Shallow", "Partial", "P + S"],
  }

  return (
    <div className="page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">STRATEGY COMPARISON</div>
          <h1>Optimization benchmark</h1>
          <p>
            Estimated performance for <b>{repoName}</b> under a {workloadName.toLowerCase()} workload.
          </p>
        </div>
        <Button variant="secondary" onClick={handleRunBenchmark} disabled={running}>
          <RefreshCw size={14} className={running ? "animate-spin" : ""} /> {running ? "Running experiment..." : "Run benchmark"}
        </Button>
      </div>

      <div className="benchmark-summary">
        <div className="winner-icon">
          <Zap size={21} />
        </div>
        <div>
          <small>BEST STRATEGY FOR THIS WORKLOAD</small>
          <h2>{benchmarks?.best_strategy || "Partial clone + sparse checkout"}</h2>
          <p>Lowest setup time and disk usage while retaining full branch & history integrity.</p>
        </div>
        <div className="saving">
          <small>ESTIMATED TIME SAVED</small>
          <strong>{benchmarks?.estimated_time_saved || "21m 31s"}</strong>
          <span>{benchmarks?.percent_faster || 76}% faster</span>
        </div>
      </div>

      <section className="panel benchmark-table">
        <div className="benchmark-row benchmark-head">
          <span>Strategy</span>
          <span>Clone time</span>
          <span>Data transferred</span>
          <span>Disk usage</span>
          <span>Relative time</span>
        </div>
        {strategies.map((row) => (
          <div
            className={`benchmark-row ${row.is_best ? "best" : ""}`}
            key={row.strategy}
          >
            <span>
              <b>{row.strategy}</b>
              {row.is_best && <i>BEST</i>}
            </span>
            <span>{row.time}</span>
            <span>{row.transfer}</span>
            <span>{row.disk}</span>
            <span>
              <i className="bar">
                <i style={{ width: `${row.relative_percent}%` }} />
              </i>
              <small>{row.relative_percent}%</small>
            </span>
          </div>
        ))}
      </section>

      <div className="benchmark-charts">
        {[
          ["Clone time", "Minutes", chartSeries.clone_time_min],
          ["Data transferred", "Gigabytes", chartSeries.data_transferred_gb],
          ["Disk usage", "Gigabytes", chartSeries.disk_usage_gb],
        ].map(([title, unit, values]) => (
          <section className="panel mini-chart-card" key={String(title)}>
            <div className="panel-heading">
              <div>
                <span>{String(title)}</span>
                <small>{String(unit)}</small>
              </div>
            </div>
            <div className="vertical-bars">
              {(values as number[]).map((value, index) => (
                <div key={index}>
                  <span>{value}</span>
                  <i
                    style={{
                      height: `${(value / Math.max(...(values as number[]))) * 100}%`,
                    }}
                    className={index === 3 ? "best-bar" : ""}
                  />
                  <small>
                    {chartSeries.labels[index] || ["Full", "Shallow", "Partial", "P + S"][index]}
                  </small>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="apply-card">
        <div>
          <Terminal size={20} />
          <span>
            <strong>Ready to use the recommended strategy?</strong>
            <small>
              Get the exact commands and configuration for your workflow.
            </small>
          </span>
        </div>
        <Button onClick={() => navigate(`/configuration${currentIdParam}`)}>
          View configuration <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  )
}
