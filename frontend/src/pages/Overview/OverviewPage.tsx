import { ArrowRight, ChevronRight, FolderGit2, RefreshCw } from "lucide-react"
import { useNavigate } from "react-router"
import Button from "../../components/common/Button"
import { metrics } from "../../data/repository"

export default function OverviewPage() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="repository-header">
        <div>
          <div className="repo-name">
            <FolderGit2 size={20} />
            <h1>
              microsoft / <strong>git</strong>
            </h1>
            <span>PUBLIC</span>
          </div>
          <p>
            Analyzed today at 10:42 · Workload: <b>Local development</b>
          </p>
        </div>
        <Button variant="secondary">
          <RefreshCw size={14} /> Re-analyze
        </Button>
      </div>
      <section className="health-summary">
        <div className="score">
          <strong>72</strong>
          <span>/ 100</span>
        </div>
        <div>
          <small>OPTIMIZATION OPPORTUNITY SCORE</small>
          <h2>Repository needs optimization</h2>
          <p>
            Three supported strategies could meaningfully reduce setup time and
            local disk usage.
          </p>
        </div>
        <div className="health-action">
          <span className="warning-badge">3 opportunities found</span>
          <Button onClick={() => navigate("/recommendations")}>
            View recommendations <ArrowRight size={14} />
          </Button>
        </div>
      </section>
      <div className="metrics-grid">
        {metrics.map(({ label, value, hint, Icon }) => (
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
              <small>32.4 GB total storage</small>
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
                ["Blobs", "28.6 GB", "green"],
                ["Trees", "2.8 GB", "purple"],
                ["Commits", "812 MB", "blue"],
                ["Tags", "188 MB", "gray"],
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
          <button onClick={() => navigate("/recommendations")}>
            View all <ArrowRight size={13} />
          </button>
        </div>
        {[
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
          <div className="issue-row" key={title}>
            <span
              className={`impact-tag ${tag === "HIGH IMPACT" ? "high" : ""}`}
            >
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
        ))}
      </section>
    </div>
  )
}
