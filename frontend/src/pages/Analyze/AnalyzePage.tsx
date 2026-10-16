import { FormEvent, useEffect, useState } from "react"
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  FolderGit2,
  Layers3,
  Loader2,
  SlidersHorizontal,
} from "lucide-react"
import { useNavigate } from "react-router"
import Button from "../../components/common/Button"
import { api, WorkloadProfile } from "../../api/client"

type Workload = "local" | "cicd" | "monorepo"

export default function AnalyzePage() {
  const navigate = useNavigate()
  const [url, setUrl] = useState("https://github.com/microsoft/git")
  const [workload, setWorkload] = useState<Workload>("local")
  const [advanced, setAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workloadProfiles, setWorkloadProfiles] = useState<WorkloadProfile[]>([])

  useEffect(() => {
    api.getWorkloads()
      .then((profiles) => setWorkloadProfiles(profiles))
      .catch((err) => console.warn("Failed to fetch workloads, will use defaults:", err))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setError(null)

    try {
      // Map frontend selected workload to backend workload slug
      const slugMap: Record<Workload, string> = {
        local: "local_dev",
        cicd: "ci_cd",
        monorepo: "monorepo",
      }
      const targetSlug = slugMap[workload]
      const matched = workloadProfiles.find((p) => p.slug === targetSlug)
      const workloadId = matched?.id || "11111111-1111-4111-8111-111111111111"

      // 1. Register repository
      const repo = await api.createRepository({
        url_path: url.trim(),
        workload_id: workloadId,
      })

      // 2. Start analysis
      const analysis = await api.startAnalysis({
        repository_id: repo.id,
      })

      // 3. Navigate to progress screen with analysis ID
      navigate(`/progress?id=${analysis.id}`)
    } catch (err) {
      console.error("Analysis submission error:", err)
      setError(err instanceof Error ? err.message : "Failed to start analysis")
      setLoading(false)
    }
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

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', fontSize: '14px' }}>
          {error}
        </div>
      )}

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
                disabled={loading}
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
                  disabled={loading}
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
          disabled={loading}
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
            <CheckCircle2 size={14} /> Read-only analysis. GitOpt never modifies your
            repository.
          </span>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Starting...
              </>
            ) : (
              <>
                Start analysis <ArrowRight size={15} />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
