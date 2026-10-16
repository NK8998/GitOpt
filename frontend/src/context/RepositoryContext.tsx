import { createContext, useContext, useState, type ReactNode } from "react"
import type { RepositoryItem } from "../api/client"

interface RepositoryContextValue {
  currentRepository: RepositoryItem | null
  setCurrentRepository: (repository: RepositoryItem | null) => void
}

const RepositoryContext = createContext<RepositoryContextValue | undefined>(
  undefined,
)

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const [currentRepository, setCurrentRepository] =
    useState<RepositoryItem | null>(null)

  return (
    <RepositoryContext.Provider
      value={{ currentRepository, setCurrentRepository }}
    >
      {children}
    </RepositoryContext.Provider>
  )
}

export function useRepository() {
  const context = useContext(RepositoryContext)
  if (!context) {
    throw new Error("useRepository must be used within a RepositoryProvider")
  }
  return context
}
