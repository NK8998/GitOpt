import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  Play,
  Search,
  SlidersHorizontal,
  Zap,
} from "lucide-react"
import { useNavigate } from "react-router"
import Brand from "../../components/common/Brand"
import Button from "../../components/common/Button"

export default function HomePage() {
  const navigate = useNavigate()
  const onAnalyze = () => navigate("/analyze")
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav>
          <a href="#workflow">How it works</a>
          <a href="#capabilities">Capabilities</a>
          <Button variant="secondary" onClick={onAnalyze}>
            Open GitOpt <ArrowRight size={14} />
          </Button>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="status-pill">
              <span />
              Repository intelligence for Git
            </div>
            <h1>
              Make Git repositories <span>faster.</span>
            </h1>
            <p>
              Analyze your repository, understand where Git performance is being
              lost, and get optimization recommendations tailored to how you
              work.
            </p>
            <div className="hero-actions">
              <Button onClick={onAnalyze}>
                Analyze a repository <ArrowRight size={16} />
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  document.querySelector("#workflow")?.scrollIntoView()
                }
              >
                <Play size={14} fill="currentColor" /> See how it works
              </Button>
            </div>
            <div className="hero-proof">
              <CheckCircle2 size={15} />
              No repository changes
              <span />
              <CheckCircle2 size={15} />
              Evidence-based recommendations
            </div>
          </div>

          <div className="dashboard-preview">
            <div className="preview-window-bar">
              <div className="window-dots">
                <span />
                <span />
                <span />
              </div>
              <small>github.com/microsoft/git</small>
              <span className="preview-live">
                <i /> Analysis complete
              </span>
            </div>
            <div className="preview-body">
              <div className="preview-title">
                <div>
                  <small>REPOSITORY PERFORMANCE</small>
                  <h3>microsoft / git</h3>
                </div>
                <span className="warning-badge">Needs optimization</span>
              </div>
              <div className="preview-metrics">
                <div>
                  <small>REPOSITORY SIZE</small>
                  <strong>
                    32.4 <em>GB</em>
                  </strong>
                  <span>+18% this year</span>
                </div>
                <div>
                  <small>GIT OBJECTS</small>
                  <strong>
                    2.1 <em>M</em>
                  </strong>
                  <span>1.8M blobs</span>
                </div>
                <div>
                  <small>CLONE TIME</small>
                  <strong>
                    28 <em>min</em>
                  </strong>
                  <span>Estimated</span>
                </div>
              </div>
              <div className="preview-chain">
                <div>
                  <Database size={16} />
                  <span>
                    <small>OBSERVED</small>
                    <b>28.6 GB blob data</b>
                  </span>
                </div>
                <ArrowRight size={15} />
                <div>
                  <Activity size={16} />
                  <span>
                    <small>BOTTLENECK</small>
                    <b>Expensive clone</b>
                  </span>
                </div>
                <ArrowRight size={15} />
                <div className="chain-solution">
                  <Zap size={16} />
                  <span>
                    <small>RECOMMENDATION</small>
                    <b>Partial clone</b>
                  </span>
                </div>
              </div>
              <div className="preview-result">
                <div>
                  <span>Estimated clone time</span>
                  <strong>
                    28m <ArrowRight size={14} /> <em>8m</em>
                  </strong>
                </div>
                <div className="mini-bars">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span className="improvement">71% faster</span>
              </div>
            </div>
          </div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="section-kicker">A COMPLETE EVIDENCE CHAIN</div>
          <h2>From repository data to a measurable improvement.</h2>
          <p>
            GitOpt explains every recommendation, so you know what to change and
            why.
          </p>
          <div className="workflow-grid">
            {[
              [
                Database,
                "01",
                "Repository analysis",
                "Inspect size, history, objects, files, and storage characteristics.",
              ],
              [
                SlidersHorizontal,
                "02",
                "Workload profile",
                "Understand whether Git serves local, CI/CD, or monorepo work.",
              ],
              [
                Search,
                "03",
                "Detected bottleneck",
                "Connect repository evidence to the operation it is slowing down.",
              ],
              [
                Zap,
                "04",
                "Recommendation",
                "Apply the right Git mechanism with a ready-to-run command.",
              ],
            ].map(([Icon, number, title, text]) => {
              const CardIcon = Icon as typeof Database
              return (
                <article key={String(number)}>
                  <div className="feature-top">
                    <CardIcon size={19} />
                    <span>{String(number)}</span>
                  </div>
                  <h3>{String(title)}</h3>
                  <p>{String(text)}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="bottom-cta" id="capabilities">
          <div>
            <small>START WITH YOUR REPOSITORY</small>
            <h2>Stop guessing which Git optimization you need.</h2>
          </div>
          <Button onClick={onAnalyze}>
            Analyze your repository <ArrowRight size={16} />
          </Button>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Repository performance, explained.</span>
        <small>GitOpt MVP · 2026</small>
      </footer>
    </div>
  )
}
