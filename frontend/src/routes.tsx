import { Navigate, createBrowserRouter } from "react-router"
import MainLayout from "./components/layout/MainLayout"
import AnalyzePage from "./pages/Analyze/AnalyzePage"
import BenchmarksPage from "./pages/Benchmarks/BenchmarksPage"
import ConfigurationPage from "./pages/Configuration/ConfigurationPage"
import HomePage from "./pages/Home/HomePage"
import OverviewPage from "./pages/Overview/OverviewPage"
import ProgressPage from "./pages/Progress/ProgressPage"
import RecommendationsPage from "./pages/Recommendations/RecommendationsPage"

export const router = createBrowserRouter([
  { path: "/", Component: HomePage },
  {
    Component: MainLayout,
    children: [
      { path: "analyze", Component: AnalyzePage },
      { path: "progress", Component: ProgressPage },
      { path: "overview", Component: OverviewPage },
      { path: "recommendations", Component: RecommendationsPage },
      { path: "benchmarks", Component: BenchmarksPage },
      { path: "configuration", Component: ConfigurationPage },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
])
