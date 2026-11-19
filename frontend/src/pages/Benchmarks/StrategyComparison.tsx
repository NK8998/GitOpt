import { useState } from "react";
import { ArrowRight, ArrowUp, ChevronDown, RefreshCw, Zap } from "lucide-react";
import { Link } from "react-router";
import { api } from "../../api/client";
import type { BenchmarkComparison, BenchmarkStrategy } from "../../api/client";
import Button from "../../components/common/Button";
import CopyButton from "../../components/common/CopyButton";
import { formatModelTime } from "./benchmarkPresentation";

const metrics = [
  { label: "Clone Time", field: "time", series: "clone_time_min" },
  { label: "Data Transferred", field: "transfer", series: "data_transferred_gb" },
  { label: "Disk Usage", field: "disk", series: "disk_usage_gb" },
] as const;

function strategyTone(strategy: string) {
  const name = strategy.toLowerCase();
  if (name.includes("sparse")) return "sparse";
  if (name.includes("partial")) return "partial";
  if (name.includes("shallow")) return "shallow";
  return "full";
}

function StrategyName({ strategy }: { strategy: BenchmarkStrategy }) {
  return (
    <span className="benchmark-strategy-name">
      <i className={`benchmark-strategy-tone benchmark-tone-${strategyTone(strategy.strategy)}`} aria-hidden="true" />
      {strategy.strategy}
    </span>
  );
}

export default function StrategyComparison({ comparison, repository, workload, running, onRecalculate }: {
  comparison: BenchmarkComparison;
  repository: string;
  workload?: string;
  running: boolean;
  onRecalculate: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const metric = metrics[selected];
  const series = comparison.chart_series[metric.series];
  const max = Math.max(0, ...series.filter((point) => Number.isFinite(point)));
  const values = (row: BenchmarkStrategy) => metric.field === "time" ? formatModelTime(row.time) : row[metric.field];

  return (
    <section id="strategy-comparison" tabIndex={-1} className="panel benchmark-comparison" aria-labelledby="strategy-comparison-heading">
      <div className="benchmark-section-heading benchmark-section-heading-row">
        <div>
          <h2 id="strategy-comparison-heading">Optimization Strategy Comparison</h2>
          <p>{repository}{workload ? ` · ${workload}` : ""}</p>
        </div>
        <Button variant="secondary" disabled={running} onClick={onRecalculate}>
          <RefreshCw size={14} aria-hidden="true" /> {running ? "Recalculating…" : "Recalculate estimates"}
        </Button>
      </div>

      <div className="benchmark-chart-toolbar">
        <span className="benchmark-model-label">Modelled Estimates — Not Measured Benchmarks</span>
        <div className="benchmark-segments" role="group" aria-label="Strategy comparison metric">
          {metrics.map((item, index) => (
            <button type="button" key={item.field} aria-pressed={index === selected} onClick={() => setSelected(index)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="benchmark-chart" aria-label={`Modelled ${metric.label.toLowerCase()} by strategy`}>
        {comparison.strategies.map((row, index) => {
          const point = series[index];
          const percentage = max > 0 && Number.isFinite(point) ? Math.max(0, (point / max) * 100) : 0;
          return (
            <li className="benchmark-chart-row" key={row.strategy}>
              <div className="benchmark-chart-name">
                <StrategyName strategy={row} />
                {row.is_best && <span className="benchmark-recommended-label">Recommended</span>}
              </div>
              <div className="benchmark-chart-track">
                <div className="benchmark-chart-bar-position" style={{ width: `${percentage}%` }}>
                  <div className={`benchmark-chart-bar benchmark-tone-${strategyTone(row.strategy)}`} aria-hidden="true" />
                  <span className="benchmark-chart-value">{values(row)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="benchmark-table-wrap" tabIndex={0} role="region" aria-label="Strategy table">
        <table className="benchmark-data-table" aria-label="Exact modelled strategy estimates">
          <thead>
            <tr>
              <th scope="col">Strategy</th>
              <th scope="col">Clone time</th>
              <th scope="col">Transfer</th>
              <th scope="col">Disk usage</th>
            </tr>
          </thead>
          <tbody>
            {comparison.strategies.map((row) => (
              <tr className={row.is_best ? "benchmark-best-row" : undefined} key={row.strategy}>
                <th scope="row"><StrategyName strategy={row} /></th>
                <td>{formatModelTime(row.time)}</td>
                <td>{row.transfer}</td>
                <td>{row.disk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GeneratedCommands({ analysisId }: { analysisId: string }) {
  const [commands, setCommands] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadCommands() {
    if (loading || commands !== null) return;
    setLoading(true);
    setError(null);
    try {
      const recommendations = await api.getRecommendations(analysisId);
      setCommands(recommendations.flatMap((item) => item.templates ?? [])
        .filter((template) => template.format === "shell")
        .map((template) => `# ${template.title}\n${template.content}`)
        .join("\n\n"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the generated Git commands.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="benchmark-command-disclosure" onToggle={(event) => {
      if (event.currentTarget.open && !error) void loadCommands();
    }}>
      <summary><ChevronDown className="benchmark-chevron" size={15} aria-hidden="true" /> Generated Git commands</summary>
      {loading && <p role="status">Loading generated commands…</p>}
      {error && <div><p role="alert">{error}</p><Button variant="secondary" onClick={() => void loadCommands()}>Retry</Button></div>}
      {commands === "" && <p>No shell commands were generated for this analysis.</p>}
      {commands && (
        <div className="benchmark-commands">
          <div><CopyButton text={commands} label="Copy Git commands" /></div>
          <pre tabIndex={0} aria-label="Generated Git commands"><code>{commands}</code></pre>
        </div>
      )}
    </details>
  );
}

export function StrategyRecommendation({ comparison, analysisId }: { comparison: BenchmarkComparison; analysisId: string }) {
  const best = comparison.strategies.find((strategy) => strategy.is_best);
  const title = (best?.strategy ?? comparison.best_strategy).replace(/\bsparse\b/i, "Sparse");
  const hasSparse = title.toLowerCase().includes("sparse");
  const stats = [
    { label: "Estimated time saved", value: formatModelTime(comparison.estimated_time_saved) },
    { label: "Modelled speed improvement", value: `${comparison.percent_faster}% faster` },
    { label: "Estimated clone time", value: best ? formatModelTime(best.time) : "—" },
    { label: "Estimated transfer", value: best?.transfer ?? "—" },
  ];

  return (
    <section className="panel benchmark-recommendation" aria-labelledby="strategy-recommendation-heading">
      <div className="benchmark-recommendation-header">
        <div className="benchmark-recommendation-icon"><Zap size={19} aria-hidden="true" /></div>
        <div>
          <h2 id="strategy-recommendation-heading">Recommended Strategy: {title}</h2>
          <p>{hasSparse
            ? "Partial clone reduces initial object transfer, while sparse checkout limits the files materialized in the working tree. This combination is predicted to provide the best performance for the selected workload."
            : "This strategy is predicted to provide the best performance for the selected workload."}</p>
        </div>
      </div>
      <dl className="benchmark-recommendation-stats">
        {stats.map(({ label, value }, index) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={index === 1 ? "benchmark-positive" : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="benchmark-recommendation-note">Recommendation based on modelled estimates. Validate using a disposable clone before adopting.</p>
      <div className="benchmark-actions">
        <Link className="button button-primary" to={`/configuration?id=${analysisId}`}>View Configuration <ArrowRight size={15} aria-hidden="true" /></Link>
        <a className="button button-secondary" href="#strategy-comparison">Compare Strategies <ArrowUp size={14} aria-hidden="true" /></a>
      </div>
      <GeneratedCommands key={analysisId} analysisId={analysisId} />
    </section>
  );
}
