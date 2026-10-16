import { ArrowRight, BarChart3, CheckCircle2, Terminal } from "lucide-react"
import { useNavigate } from "react-router"
import Button from "../../components/common/Button"
import CopyButton from "../../components/common/CopyButton"
import { recommendations } from "../../data/repository"

export default function RecommendationsPage() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">EVIDENCE-BASED</div>
          <h1>Optimization recommendations</h1>
          <p>
            Based on repository characteristics and the <b>Local development</b>{" "}
            workload.
          </p>
        </div>
        <span className="analysis-id">ANALYSIS ID&nbsp; 8C4F-21A</span>
      </div>
      <div className="evidence-chain">
        {[
          ["OBSERVED", "28.6 GB blob data"],
          ["WORKLOAD", "Local development"],
          ["BOTTLENECK", "Expensive setup"],
          ["BEST FIT", "Partial clone"],
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
        {recommendations.map((item) => (
          <article className="recommendation-card" key={item.number}>
            <div className="recommendation-number">{item.number}</div>
            <div className="recommendation-main">
              <div className="recommendation-title">
                <div>
                  <span
                    className={
                      item.number === "01" ? "impact-tag high" : "impact-tag"
                    }
                  >
                    {item.impact}
                  </span>
                  <h2>{item.title}</h2>
                </div>
                <span className="confidence">
                  <CheckCircle2 size={13} /> {item.confidence}
                </span>
              </div>
              <div className="why">
                <small>WHY THIS WAS RECOMMENDED</small>
                <p>{item.why}</p>
              </div>
              <div className="benefit-command">
                <div className="benefit">
                  <small>POTENTIAL BENEFIT · ESTIMATED</small>
                  <span>{item.metric}</span>
                  <strong>
                    {item.current} <ArrowRight size={15} />{" "}
                    <em>{item.optimized}</em>
                  </strong>
                </div>
                <div className="code-block">
                  <div>
                    <Terminal size={13} /> RECOMMENDED COMMAND
                  </div>
                  <pre>{item.command}</pre>
                  <CopyButton text={item.command} />
                </div>
              </div>
            </div>
          </article>
        ))}
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
        <Button onClick={() => navigate("/benchmarks")}>
          View benchmarks <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  )
}
