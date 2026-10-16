import { useState } from "react"
import { ArrowRight, Download, FileCode2, Gauge, Terminal } from "lucide-react"
import Button from "../../components/common/Button"
import CopyButton from "../../components/common/CopyButton"

export default function ConfigurationPage() {
  const [tab, setTab] = useState("Commands")
  const command = `# Clone without downloading all blob contents
git clone --filter=blob:none \\
  https://github.com/microsoft/git.git

# Enable cone-mode sparse checkout
cd git
git sparse-checkout init --cone

# Select the directories needed for local development
git sparse-checkout set src/backend Documentation`
  return (
    <div className="page configuration-page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">READY TO APPLY</div>
          <h1>Your Git configuration</h1>
          <p>
            Commands generated from the accepted recommendations for{" "}
            <b>microsoft/git</b>.
          </p>
        </div>
        <Button variant="secondary">
          <Download size={14} /> Export report
        </Button>
      </div>
      <div className="config-layout">
        <section className="panel config-panel">
          <div className="tabs">
            {["Commands", "Git config", "Documentation"].map((item) => (
              <button
                className={tab === item ? "active" : ""}
                onClick={() => setTab(item)}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          {tab === "Commands" ? (
            <>
              <div className="config-meta">
                <span>
                  <Terminal size={14} /> Shell commands
                </span>
                <CopyButton text={command} label="Copy all" />
              </div>
              <pre className="config-code">
                <code>{command}</code>
              </pre>
            </>
          ) : (
            <div className="placeholder-tab">
              <FileCode2 size={28} />
              <h3>{tab}</h3>
              <p>
                This section will be available when backend-generated
                configurations are connected.
              </p>
            </div>
          )}
        </section>
        <aside className="config-aside">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span>Expected impact</span>
                <small>Estimated from repository profile</small>
              </div>
            </div>
            {[
              ["Clone time", "28m", "6m 43s"],
              ["Data transfer", "32.4 GB", "5.2 GB"],
              ["Disk usage", "34.1 GB", "6.7 GB"],
            ].map(([label, before, after]) => (
              <div className="impact-row" key={label}>
                <span>{label}</span>
                <b>{before}</b>
                <ArrowRight size={13} />
                <strong>{after}</strong>
              </div>
            ))}
          </section>
          <section className="tradeoff-card">
            <Gauge size={18} />
            <div>
              <strong>Before you apply</strong>
              <p>
                Partial clones fetch missing objects on demand and require
                network access for uncached content.
              </p>
            </div>
          </section>
          <Button className="download-button">
            <Download size={15} /> Download configuration
          </Button>
        </aside>
      </div>
    </div>
  )
}
