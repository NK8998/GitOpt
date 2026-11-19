import { ChevronRight, Menu, Moon } from "lucide-react"

export default function AppHeader({
  title,
  onMenu,
}: {
  title: string
  onMenu: () => void
}) {
  return (
    <header className="app-header">
      <button className="menu-button" onClick={onMenu} aria-label="Open menu">
        <Menu size={19} />
      </button>
      <div>
        <span>GitOpt</span>
        <ChevronRight size={13} />
        <strong>{title}</strong>
      </div>
      <div className="header-actions">
        <button aria-label="Toggle theme">
          <Moon size={16} />
        </button>
        <button className="avatar" aria-label="Account">
          NK
        </button>
      </div>
    </header>
  )
}
