import { RouterProvider } from "react-router"
import { RepositoryProvider } from "./context/RepositoryContext"
import { router } from "./routes"

export default function App() {
  return (
    <RepositoryProvider>
      <RouterProvider router={router} />
    </RepositoryProvider>
  )
}
