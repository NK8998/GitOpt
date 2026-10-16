import { GitBranch } from "lucide-react"

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <GitBranch size={17} strokeWidth={2.3} />
      </div>
      {!compact && <strong>GitOpt</strong>}
    </div>
  )
}
