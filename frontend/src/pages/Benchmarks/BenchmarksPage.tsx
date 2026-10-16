import { ArrowRight, RefreshCw, Terminal, Zap } from "lucide-react"
import { useNavigate } from "react-router"
import Button from "../../components/common/Button"
import { benchmarkRows } from "../../data/repository"

export default function BenchmarksPage() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">STRATEGY COMPARISON</div>
          <h1>Optimization benchmark</h1>
          <p>
            Estimated performance for <b>microsoft/git</b> under a local
            development workload.
          </p>
        </div>
        <Button variant="secondary">
          <RefreshCw size={14} /> Run benchmark
        </Button>
      </div>
      <div className="benchmark-summary">
        <div className="winner-icon">
          <Zap size={21} />
        </div>
        <div>
          <small>BEST STRATEGY FOR THIS WORKLOAD</small>
          <h2>Partial clone + sparse checkout</h2>
          <p>Lowest setup time and disk usage while retaining full history.</p>
        </div>
        <div className="saving">
          <small>ESTIMATED TIME SAVED</small>
          <strong>21m 31s</strong>
          <span>76% faster</span>
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
        {benchmarkRows.map((row) => (
          <div
            className={`benchmark-row ${row.best ? "best" : ""}`}
            key={row.strategy}
          >
            <span>
              <b>{row.strategy}</b>
              {row.best && <i>BEST</i>}
            </span>
            <span>{row.time}</span>
            <span>{row.transfer}</span>
            <span>{row.disk}</span>
            <span>
              <i className="bar">
                <i style={{ width: `${row.width}%` }} />
              </i>
              <small>{row.width}%</small>
            </span>
          </div>
        ))}
      </section>
      <div className="benchmark-charts">
        {[
          ["Clone time", "Minutes", [28, 12, 8, 6]],
          ["Data transferred", "Gigabytes", [32, 14, 7, 5]],
          ["Disk usage", "Gigabytes", [34, 15, 9, 7]],
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
                      height: `${(value / Math.max(...values as number[])) * 100}%`,
                    }}
                    className={index === 3 ? "best-bar" : ""}
                  />
                  <small>
                    {["Full", "Shallow", "Partial", "P + S"][index]}
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
        <Button onClick={() => navigate("/configuration")}>
          View configuration <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  )
}
