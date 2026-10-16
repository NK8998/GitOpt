import { FormEvent, useEffect, useState } from "react"
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  FolderGit2,
  Layers3,
  Loader2,
} from "lucide-react"
import { useNavigate } from "react-router"
import Button from "../../components/common/Button"
import { api, WorkloadProfile } from "../../api/client"
import { useRepository } from "../../context/RepositoryContext"

type Workload = "local" | "cicd" | "monorepo"

export default function AnalyzePage() {
  const navigate = useNavigate()
  const { setCurrentRepository } = useRepository()
  const [url, setUrl] = useState("")
  const [workload, setWorkload] = useState<Workload>("local")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workloadProfiles, setWorkloadProfiles] = useState<WorkloadProfile[]>(
    [],
  )

  useEffect(() => {
    api
      .getWorkloads()
      .then(setWorkloadProfiles)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load workload profiles",
        ),
      )
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const repositoryUrl = url.trim()
    if (!repositoryUrl) return

    setLoading(true)
    setError(null)

    try {
      const parsed = new URL(repositoryUrl)
      if (
        parsed.hostname.toLowerCase() !== "github.com" ||
        parsed.pathname.split("/").filter(Boolean).length < 2
      ) {
        throw new Error(
          "Remote analysis currently supports GitHub repository URLs in the form https://github.com/owner/repository.",
        )
      }

      const slugMap: Record<Workload, WorkloadProfile["slug"]> = {
        local: "local_dev",
        cicd: "ci_cd",
        monorepo: "monorepo",
      }
      const matched = workloadProfiles.find(
        (profile) => profile.slug === slugMap[workload],
      )
      if (!matched)
        throw new Error(
          "The selected workload profile is unavailable. Refresh the page and try again.",
        )

      const repo = await api.createRepository({
        url_path: repositoryUrl,
        workload_id: matched.id,
        source: "github",
      })

      setCurrentRepository(repo)
      const analysis = await api.startAnalysis({ repository_id: repo.id })
      navigate(`/progress?id=${analysis.id}`)
    } catch (err) {
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
          Provide a GitHub repository and tell GitOpt how your team primarily
          uses it.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: 16,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            color: "#f87171",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={submit} className="setup-card">
        <div className="setup-section">
          <div className="section-number">01</div>
          <div className="setup-content">
            <h2>Repository</h2>
            <p>Enter the GitHub URL of the repository you want to inspect.</p>
            <label>REPOSITORY URL</label>
            <div className="repo-input">
              <FolderGit2 size={18} />
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                type="url"
                placeholder="https://github.com/owner/repository"
                required
                disabled={loading}
              />
              <span>GITHUB</span>
            </div>
            <small className="field-help">
              <CheckCircle2 size={13} /> Public repositories work directly.
              Private repositories require backend GITHUB_TOKEN read access.
            </small>
          </div>
        </div>

        <div className="setup-divider" />
        <div className="setup-section">
          <div className="section-number">02</div>
          <div className="setup-content">
            <h2>How do you primarily use this repository?</h2>
            <p>
              Workload context prevents GitOpt from recommending Git strategies
              that do not fit your workflow.
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
        <div className="setup-section">
          <div className="section-number">03</div>
          <div className="setup-content">
            <h2>Analysis scope</h2>
            <p>
              GitOpt currently collects repository metadata, commit depth,
              branches, the default-branch tree, large files, and
              repository-size evidence. Clone timing and strategy comparisons
              are modelled estimates until isolated operation benchmarking is
              implemented.
            </p>
          </div>
        </div>

        <div className="setup-footer">
          <span>
            <CheckCircle2 size={14} /> Read-only analysis. GitOpt never modifies
            your repository.
          </span>
          <Button
            type="submit"
            disabled={loading || workloadProfiles.length === 0}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Analyzing...
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
