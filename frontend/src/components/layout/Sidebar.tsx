import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  CircleGauge,
  FolderGit2,
  History,
  Home,
  Search,
  Settings,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react"
import { useLocation, useNavigate } from "react-router"
import Brand from "../common/Brand"
import Button from "../common/Button"

export default function Sidebar({
  open,
  close,
}: {
  open: boolean
  close: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const nav = [
    ["/overview", CircleGauge, "Overview"],
    ["/recommendations", Sparkles, "Recommendations"],
    ["/benchmarks", BarChart3, "Benchmarks"],
    ["/configuration", Terminal, "Configuration"],
  ] as const
  const goTo = (path: string) => {
    navigate(path)
    close()
  }
  return (
    <>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close menu"
          onClick={close}
        />
      )}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            aria-label="Close menu"
            className="mobile-close"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <Button className="new-analysis" onClick={() => goTo("/analyze")}>
          <Search size={15} /> Analyze repository
        </Button>
        <p className="nav-label">WORKSPACE</p>
        <nav className="side-nav">
          <button
            className={
              ["/analyze", "/progress"].includes(location.pathname)
                ? "active"
                : ""
            }
            onClick={() => goTo("/analyze")}
          >
            <Home size={16} /> Dashboard
          </button>
          <button>
            <History size={16} /> Analysis history{" "}
            <span className="soon">SOON</span>
          </button>
        </nav>
        <p className="nav-label repository-label">CURRENT REPOSITORY</p>
        <div className="current-repo">
          <div>
            <FolderGit2 size={16} />
          </div>
          <span>
            <strong>microsoft/git</strong>
            <small>Local development</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <nav className="side-nav repository-nav">
          {nav.map(([path, Icon, label]) => (
            <button
              key={path}
              className={location.pathname === path ? "active" : ""}
              onClick={() => goTo(path)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button>
            <Settings size={16} /> Settings
          </button>
          <button onClick={() => goTo("/")}>
            <ArrowLeft size={16} /> Back to home
          </button>
          <div className="mvp-card">
            <Zap size={16} />
            <span>
              <strong>GitOpt MVP</strong>
              <small>Frontend prototype</small>
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
