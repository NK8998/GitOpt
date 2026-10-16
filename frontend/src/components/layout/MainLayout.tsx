import { useEffect, useState } from "react"
import { Outlet, useLocation } from "react-router"
import AppHeader from "./AppHeader"
import Sidebar from "./Sidebar"

const titles: Record<string, string> = {
  "/analyze": "Analyze repository",
  "/progress": "Analysis progress",
  "/overview": "microsoft/git",
  "/recommendations": "Recommendations",
  "/benchmarks": "Benchmarks",
  "/configuration": "Configuration",
}

export default function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

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
