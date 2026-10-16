import { FormEvent, useState } from "react"
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  FolderGit2,
  Layers3,
  SlidersHorizontal,
} from "lucide-react"
import { useNavigate } from "react-router"
import Button from "../../components/common/Button"

type Workload = "local" | "cicd" | "monorepo"

export default function AnalyzePage() {
  const navigate = useNavigate()
  const [url, setUrl] = useState("https://github.com/microsoft/git")
  const [workload, setWorkload] = useState<Workload>("local")
  const [advanced, setAdvanced] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (url.trim()) navigate("/progress")
  }
  const workloadOptions = [
    [
      "local",
      Code2,
      "Local development",
      "Frequent branches, checkouts, and work across a subset of files.",
    ],
    [
      "cicd",
      Activity,
      "CI / CD",
      "Repositories cloned or fetched in short-lived build environments.",
    ],
    [
      "monorepo",
      Layers3,
      "Monorepo development",
      "Multiple projects and teams working in different areas.",
    ],
  ] as const
  return (
    <div className="page narrow-page">
      <div className="page-heading">
        <div className="eyebrow">NEW ANALYSIS</div>
        <h1>Analyze a repository</h1>
        <p>
          Provide a public Git repository and tell us how your team primarily
          uses it.
        </p>
      </div>
      <form onSubmit={submit} className="setup-card">
        <div className="setup-section">
          <div className="section-number">01</div>
          <div className="setup-content">
            <h2>Repository</h2>
            <p>Enter the URL of the Git repository you want to inspect.</p>
            <label>REPOSITORY URL</label>
            <div className="repo-input">
              <FolderGit2 size={18} />
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                type="url"
                required
              />
              <span>PUBLIC</span>
            </div>
            <small className="field-help">
              <CheckCircle2 size={13} /> GitHub, GitLab, and public Git URLs are
              supported.
            </small>
          </div>
        </div>
        <div className="setup-divider" />
        <div className="setup-section">
          <div className="section-number">02</div>
          <div className="setup-content">
            <h2>How do you primarily use this repository?</h2>
            <p>
              Workload context helps GitOpt avoid irrelevant recommendations.
            </p>
            <div className="workload-options">
              {workloadOptions.map(([id, Icon, title, text]) => (
                <button
                  type="button"
                  key={id}
                  className={workload === id ? "selected" : ""}
                  onClick={() => setWorkload(id)}
                >
                  <div className="workload-icon">
                    <Icon size={18} />
                  </div>
                  <span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </span>
                  <i>{workload === id && <Check size={12} />}</i>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="setup-divider" />
        <button
          type="button"
          className="advanced-toggle"
          onClick={() => setAdvanced(!advanced)}
        >
          <span>
            <SlidersHorizontal size={16} />
            <strong>Advanced analysis options</strong>
            <small>Configure which operations GitOpt measures</small>
          </span>
          <ChevronDown size={16} className={advanced ? "rotate" : ""} />
        </button>
        {advanced && (
          <div className="advanced-options">
            {[
              "Analyze Git history",
              "Analyze large objects",
              "Measure clone performance",
              "Measure checkout performance",
            ].map((option, index) => (
              <label key={option}>
                <input defaultChecked={index < 3} type="checkbox" />{" "}
                <span>
                  <Check size={11} />
                </span>
                {option}
              </label>
            ))}
          </div>
        )}
        <div className="setup-footer">
          <span>
            <ShieldText /> Read-only analysis. GitOpt never modifies your
            repository.
          </span>
          <Button type="submit">
            Start analysis <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </div>
  )
}

function ShieldText() {
  return <CheckCircle2 size={14} />
}
