import { useEffect, useState } from "react"
import { Outlet, useLocation } from "react-router"
import AppHeader from "./AppHeader"
import Sidebar from "./Sidebar"
import { useRepository } from "../../context/RepositoryContext"

export default function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const { currentRepository } = useRepository()
  const titles: Record<string, string> = {
    "/analyze": "Analyze repository",
    "/progress": "Analysis progress",
    "/overview": currentRepository?.name || "Overview",
    "/recommendations": "Recommendations",
    "/benchmarks": "Benchmarks",
    "/configuration": "Configuration",
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [location.pathname])

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} close={() => setMenuOpen(false)} />
      <div className="app-main">
        <AppHeader
          title={titles[location.pathname] ?? "Dashboard"}
          onMenu={() => setMenuOpen(true)}
        />
        <Outlet />
      </div>
    </div>
  )
}
