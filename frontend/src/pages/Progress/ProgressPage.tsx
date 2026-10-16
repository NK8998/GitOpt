import { useEffect, useState } from "react"
import { ArrowRight, Check, Clock3, Search } from "lucide-react"
import { useNavigate } from "react-router"
import Button from "../../components/common/Button"

export default function ProgressPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const stages = [
    ["Repository discovered", "Connected to github.com/microsoft/git"],
    [
      "Metadata collected",
      "Default branch, refs, and repository configuration",
    ],
    ["Git objects analyzed", "2.1M objects · 28.6 GB blob data"],
    ["History analysis", "Scanning 184,293 commits"],
    ["Workload analysis", "Matching local development patterns"],
    ["Optimization evaluation", "Testing supported Git strategies"],
  ]
  useEffect(() => {
    const timer = window.setInterval(
      () => setStep((value) => Math.min(value + 1, stages.length)),
      650,
    )
    return () => window.clearInterval(timer)
  }, [stages.length])
  const done = step >= stages.length
  return (
    <div className="page progress-page">
      <div className="progress-heading">
        <div className={`analysis-pulse ${done ? "complete" : ""}`}>
          <Search size={21} />
        </div>
        <div>
          <div className="eyebrow">
            {done ? "ANALYSIS COMPLETE" : "ANALYSIS IN PROGRESS"}
          </div>
          <h1>{done ? "Repository analyzed" : "Analyzing microsoft/git"}</h1>
          <p>
            {done
              ? "We found 3 opportunities to improve repository performance."
              : "Building an evidence-based repository performance profile."}
          </p>
        </div>
      </div>
      <div className="progress-layout">
        <div className="pipeline-card">
          <div className="card-heading">
            <span>Analysis pipeline</span>
            <b>{Math.round((step / stages.length) * 100)}%</b>
          </div>
          <div className="progress-track">
            <span style={{ width: `${(step / stages.length) * 100}%` }} />
          </div>
          <div className="pipeline">
            {stages.map(([title, text], index) => {
              const state =
                index < step ? "done" : index === step ? "active" : "waiting"
              return (
                <div className={`pipeline-row ${state}`} key={title}>
                  <div className="stage-marker">
                    {state === "done" ? <Check size={13} /> : <span />}
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </div>
                  {state === "active" && (
                    <span className="scanning">SCANNING</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div className="live-metrics">
          <div className="card-heading">
            <span>Live metrics</span>
            <i>
              <span /> LIVE
            </i>
          </div>
          {[
            ["Repository size", "32.4 GB"],
            ["Git objects", "2,108,493"],
            ["Commits", "184,293"],
            ["Files", "96,420"],
            ["Large objects", "1,284"],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="progress-footer">
        <p>
          <Clock3 size={15} /> Large repositories may take several minutes. You
          can leave this page open.
        </p>
        {done && (
          <Button onClick={() => navigate("/overview")}>
            View analysis <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </div>
  )
}
