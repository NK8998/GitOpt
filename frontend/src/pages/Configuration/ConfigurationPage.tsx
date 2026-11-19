import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Download, FileCode2, Gauge, Loader2, Terminal } from "lucide-react"
import { useSearchParams } from "react-router"
import Button from "../../components/common/Button"
import CopyButton from "../../components/common/CopyButton"
import { api, AnalysisItem, RecommendationItem, TemplateItem } from "../../api/client"

function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "repository"
}

export default function ConfigurationPage() {
  const [searchParams] = useSearchParams()
  const requestedAnalysisId = searchParams.get("id") || ""
  const [tab, setTab] = useState("Commands")
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        let analysisId = requestedAnalysisId
        if (!analysisId) {
          const analyses = await api.getAllAnalyses()
          analysisId = analyses[0]?.id || ""
        }
        if (!analysisId) throw new Error("Run a repository analysis before generating configuration files.")

        const [analysisResult, recommendationResult] = await Promise.all([
          api.getAnalysis(analysisId),
          api.getRecommendations(analysisId),
        ])
        setAnalysis(analysisResult)
        setRecommendations(recommendationResult)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load configuration")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [requestedAnalysisId])

  const templates = useMemo(
    () => recommendations.flatMap((recommendation) => recommendation.templates || []),
    [recommendations]
  )
  const shellTemplates = templates.filter((template) => template.format === "shell")
  const gitconfigTemplates = templates.filter((template) => template.format === "gitconfig")

  const command = shellTemplates.length
    ? shellTemplates.map((template) => `# ${template.title}\n${template.content}`).join("\n\n")
    : "# No shell configuration was recommended for this analysis."

  const gitConfig = gitconfigTemplates.length
    ? gitconfigTemplates.map((template) => `# ${template.title}\n${template.content}`).join("\n\n")
    : "# No .gitconfig changes were recommended for this analysis."

  const repositoryName = analysis?.repository?.name || "repository"
  const repositoryUrl = analysis?.repository?.url_path || ""
  const workloadName = analysis?.repository?.workload?.name || "Unknown workload"
  const baseFilename = safeName(repositoryName)

  const report = useMemo(() => {
    const metricLines = (analysis?.metrics || [])
      .map((metric) => `- ${metric.metric_type}: ${metric.metric_value} ${metric.unit}`)
      .join("\n")
    const recommendationLines = recommendations
      .map((recommendation, index) => {
        const estimate = recommendation.impact_estimate
          ? `\n   - Estimated impact: ${recommendation.impact_estimate.metric_name}: ${recommendation.impact_estimate.current_value} → ${recommendation.impact_estimate.optimized_value}`
          : ""
        return `${index + 1}. ${recommendation.title} (${recommendation.severity})\n   - ${recommendation.reasoning}${estimate}`
      })
      .join("\n")

    return `# GitOpt Analysis Report\n\nRepository: ${repositoryName}\nURL: ${repositoryUrl}\nWorkload: ${workloadName}\nAnalysis ID: ${analysis?.id || ""}\nMetric source: ${analysis?.metric_source || "unknown"}\n\n## Repository metrics\n${metricLines || "No metrics available."}\n\n## Recommendations\n${recommendationLines || "No optimization recommendations matched this repository and workload."}\n\n## Generated shell configuration\n\n\`\`\`sh\n${command}\n\`\`\`\n\n## Generated Git config\n\n\`\`\`gitconfig\n${gitConfig}\n\`\`\`\n\n## Evidence notes\n${(analysis?.metric_notes || []).map((note) => `- ${note}`).join("\n") || "- No additional notes."}\n\n> Recommendation impact values are estimates unless explicitly marked as measured.\n`
  }, [analysis, recommendations, repositoryName, repositoryUrl, workloadName, command, gitConfig])

  const renderedContent = tab === "Commands" ? command : tab === "Git config" ? gitConfig : report
  const renderedIcon = tab === "Commands" ? <Terminal size={14} /> : <FileCode2 size={14} />

  const impactRows = recommendations
    .filter((recommendation) => recommendation.impact_estimate)
    .slice(0, 3)
    .map((recommendation) => recommendation.impact_estimate!)

  const downloadConfiguration = () => {
    if (tab === "Git config") {
      downloadText(`${baseFilename}.gitconfig`, gitConfig)
    } else if (tab === "Documentation") {
      downloadText(`${baseFilename}-gitopt-report.md`, report, "text/markdown;charset=utf-8")
    } else {
      downloadText(`${baseFilename}-gitopt.sh`, command, "text/x-shellscript;charset=utf-8")
    }
  }

  if (loading) {
    return (
      <div className="page configuration-page">
        <div className="page-heading"><h1>Building your Git configuration</h1></div>
        <div className="panel" style={{ padding: 32 }}><Loader2 className="animate-spin" size={22} /> Loading analysis recommendations…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page configuration-page">
        <div className="page-heading"><h1>Configuration unavailable</h1><p>{error}</p></div>
      </div>
    )
  }

  return (
    <div className="page configuration-page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">READY TO APPLY</div>
          <h1>Your Git configuration</h1>
          <p>Generated from the recommendations for <b>{repositoryName}</b>.</p>
        </div>
        <Button variant="secondary" onClick={() => downloadText(`${baseFilename}-gitopt-report.md`, report, "text/markdown;charset=utf-8")}>
          <Download size={14} /> Export report
        </Button>
      </div>
      <div className="config-layout">
        <section className="panel config-panel">
          <div className="tabs">
            {["Commands", "Git config", "Documentation"].map((item) => (
              <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>
                {item}
              </button>
            ))}
          </div>
          <div className="config-meta">
            <span>{renderedIcon} {tab}</span>
            <CopyButton text={renderedContent} label="Copy all" />
          </div>
          <pre className="config-code"><code>{renderedContent}</code></pre>
        </section>
        <aside className="config-aside">
          <section className="panel">
            <div className="panel-heading">
              <div><span>Expected impact</span><small>Estimated unless a recommendation explicitly says measured</small></div>
            </div>
            {impactRows.length ? impactRows.map((impact) => (
              <div className="impact-row" key={`${impact.metric_name}-${impact.current_value}`}>
                <span>{impact.metric_name}</span>
                <b>{impact.current_value}</b>
                <ArrowRight size={13} />
                <strong>{impact.optimized_value}</strong>
              </div>
            )) : <p style={{ padding: 16 }}>No impact estimates are available.</p>}
          </section>
          <section className="tradeoff-card">
            <Gauge size={18} />
            <div>
              <strong>Before you apply</strong>
              <p>Review each recommendation's trade-offs. Generated commands are tailored to the selected workload, but should still be tested on a disposable clone first.</p>
            </div>
          </section>
          <Button className="download-button" onClick={downloadConfiguration}>
            <Download size={15} /> Download {tab === "Commands" ? "shell script" : tab === "Git config" ? "Git config" : "report"}
          </Button>
        </aside>
      </div>
    </div>
  )
}
