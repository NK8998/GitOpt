import { useId, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, Database, File, FolderGit2, Folders, Gauge, GitBranch, GitCommitHorizontal, Info } from "lucide-react";
import type { AnalysisItem, UltraLargeComparison } from "../../api/client";
import CopyButton from "../../components/common/CopyButton";
import { formatBytes, formatDate, formatSeconds } from "./benchmarkPresentation";

function MetricHint({ label, text, unavailable = false }: { label: string; text: string; unavailable?: boolean }) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);

  return (
    <span className={`benchmark-hint${dismissed ? " benchmark-hint-dismissed" : ""}`} onMouseEnter={() => setDismissed(false)}>
      <button
        type="button"
        className={unavailable ? "benchmark-missing" : "benchmark-info-button"}
        aria-label={unavailable ? `${label} unavailable` : `About ${label}`}
        aria-describedby={id}
        onFocus={() => setDismissed(false)}
        onClick={() => setDismissed(false)}
        onKeyDown={(event) => { if (event.key === "Escape") setDismissed(true); }}
      >
        {unavailable ? "—" : <Info size={14} aria-hidden="true" />}
      </button>
      <span id={id} role="tooltip" className="benchmark-tooltip">{text}</span>
    </span>
  );
}

export function RepositoryHeader({ analysis, reference }: { analysis: AnalysisItem; reference?: UltraLargeComparison }) {
  const repository = reference?.repository ?? analysis.repository?.name ?? "Repository analysis";
  const branch = reference?.branch ?? analysis.default_branch;
  const date = reference?.collected_at ?? analysis.created_at;

  return (
    <header className="benchmark-repository-header">
      <div className="benchmark-repository-icon"><FolderGit2 size={24} aria-hidden="true" /></div>
      <div>
        {reference && <p className="benchmark-context">Pinned repository reference</p>}
        <h1>{repository}</h1>
        <ul className="benchmark-metadata" aria-label="Repository metadata">
          {branch && <li title="Branch"><GitBranch size={13} aria-hidden="true" /><code>{branch}</code></li>}
          {reference && (
            <>
              <li className="benchmark-commit" title="Snapshot commit">
                <GitCommitHorizontal size={14} aria-hidden="true" />
                <code>{reference.head_commit.slice(0, 12)}</code>
                <CopyButton text={reference.head_commit} label="Copy commit hash" iconOnly />
              </li>
              <li title="Effective network speed for the reference estimate">
                <Gauge size={14} aria-hidden="true" /><code>{reference.network_mbps} Mbps</code>
              </li>
            </>
          )}
          <li title={reference ? "Reference snapshot date" : "Analysis date"}>
            <CalendarDays size={13} aria-hidden="true" />
            <time dateTime={date}>{formatDate(date)}</time>
          </li>
        </ul>
      </div>
    </header>
  );
}

export function RepositoryMetrics({ reference }: { reference: UltraLargeComparison }) {
  const root = reference.scopes.find((scope) => scope.scope === "root");
  const full = reference.scopes.find((scope) => scope.scope === "full");
  const planningSeconds = reference.repository_bytes / (reference.network_mbps * 1_000_000 / 8);
  const metrics = [
    { label: "GitHub repository size", value: formatBytes(reference.repository_bytes, 2), subtitle: "Repository-wide storage", hint: "Storage reported by GitHub for the repository.", icon: Database },
    { label: "Full working tree", value: full && formatBytes(full.logical_checkout_bytes), subtitle: "All tracked files at HEAD", hint: "Logical file bytes for the complete pinned checkout.", icon: Folders },
    { label: "Root files", value: root && formatBytes(root.logical_checkout_bytes), subtitle: "Root-level files at HEAD", hint: "Logical file bytes for the default root-only sparse checkout.", icon: File },
    { label: "Transfer at reported size", value: formatSeconds(planningSeconds), subtitle: "Size-based planning scenario", hint: `Payload time if Git transferred the reported repository size at ${reference.network_mbps} Mbps. Server preparation, checkout, and other local work are excluded.`, icon: Clock3 },
  ];

  return (
    <section className="benchmark-grid benchmark-metrics" aria-label="Repository metrics">
      {metrics.map(({ label, value, subtitle, hint, icon: Icon }) => (
        <div className="panel benchmark-metric" key={label}>
          <div className="benchmark-metric-label">
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
            <MetricHint label={label} text={hint} />
          </div>
          <strong>{value ?? "—"}</strong>
          <small>{subtitle}</small>
        </div>
      ))}
    </section>
  );
}

export function CheckoutScopeAnalysis({ reference }: { reference?: UltraLargeComparison }) {
  const fullBytes = reference?.scopes.find((scope) => scope.scope === "full")?.logical_checkout_bytes ?? 0;

  return (
    <section className="benchmark-section" aria-labelledby="checkout-scope-heading">
      <div className="benchmark-section-heading">
        <h2 id="checkout-scope-heading">Checkout Scope Analysis</h2>
        <p>Logical file sizes and compressed checkout packs from the pinned snapshot.</p>
      </div>
      {!reference ? (
        <p className="panel benchmark-notice" role="status">The backend did not return the pinned Linux snapshot.</p>
      ) : (
        <div className="benchmark-grid benchmark-scopes">
          {reference.scopes.map((entry) => {
            const isRoot = entry.scope === "root";
            const percent = fullBytes ? (entry.logical_checkout_bytes / fullBytes) * 100 : 0;
            const percentLabel = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(percent);
            const packUnavailable = "A completed compressed checkout pack is needed for this scope.";
            const missingTransfer = reference.history_pack_bytes === null
              ? entry.checkout_pack_bytes === null
                ? "A complete history pack and a checkout pack for this scope are needed."
                : "A complete compressed history pack is needed to estimate partial-clone transfer."
              : packUnavailable;

            return (
              <article className="panel benchmark-scope" key={entry.scope}>
                <header className="benchmark-scope-header">
                  {isRoot ? <File size={17} aria-hidden="true" /> : <Folders size={17} aria-hidden="true" />}
                  <h3>{isRoot ? "Root Files Only" : "Full Working Tree"}</h3>
                </header>
                <div className="benchmark-scope-logical">
                  <strong>{formatBytes(entry.logical_checkout_bytes)}</strong>
                  <span>Logical size</span>
                </div>
                <div className="benchmark-scope-track" aria-hidden="true">
                  <span style={{ width: `${percent}%`, minWidth: percent > 0 ? 2 : 0 }} />
                </div>
                <p className="benchmark-scope-ratio">{percentLabel}% of full working-tree size</p>
                <dl className="benchmark-scope-values">
                  <div>
                    <dt>Compressed checkout pack</dt>
                    <dd>{entry.checkout_pack_bytes !== null
                      ? <span title={`${entry.checkout_pack_bytes.toLocaleString()} bytes`}>{formatBytes(entry.checkout_pack_bytes)}</span>
                      : <MetricHint label="Compressed checkout pack" text={packUnavailable} unavailable />}</dd>
                  </div>
                  <div>
                    <dt>Estimated payload time</dt>
                    <dd>{entry.checkout_transfer_seconds !== null
                      ? formatSeconds(entry.checkout_transfer_seconds)
                      : <MetricHint label="Estimated payload time" text={packUnavailable} unavailable />}</dd>
                  </div>
                  <div>
                    <dt>Partial-clone transfer estimate</dt>
                    <dd>{entry.partial_transfer_seconds !== null
                      ? formatSeconds(entry.partial_transfer_seconds)
                      : <MetricHint label="Partial-clone transfer estimate" text={missingTransfer} unavailable />}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
      {reference?.full_clone_transfer_seconds != null && (
        <p className="benchmark-scope-ratio">Estimated full-clone payload for this branch <code>{formatSeconds(reference.full_clone_transfer_seconds)}</code></p>
      )}
    </section>
  );
}

export function ReferenceMethodology({ reference, modelMethodology }: { reference?: UltraLargeComparison; modelMethodology: string }) {
  return (
    <details className="panel benchmark-disclosure">
      <summary><Info size={17} aria-hidden="true" /><span>Methodology &amp; Data Sources</span><ChevronDown className="benchmark-chevron" size={17} aria-hidden="true" /></summary>
      <div className="benchmark-disclosure-content">
        {reference && (
          <>
            <ul>
              <li>GitHub’s reported repository size describes repository-wide storage.</li>
              <li>Logical checkout size sums tracked file bytes. Git transfers use compressed packs.</li>
              <li>Pack-dependent estimates require the relevant measured packs. Payload timings exclude latency, checkout overhead, MIDX operations, and scheduler time.</li>
              <li>The original arithmetic example subtracts logical HEAD size from reported storage. <code>6.630 GB − 1.676 GB = 4.954 GB</code>.</li>
            </ul>
            <div className="benchmark-source-meta">
              <span>Git version <code>{reference.provenance.root_pack_bytes?.git_version ?? reference.git_version}</code></span>
              <span>Reference date <time dateTime={reference.collected_at}>{reference.collected_at.slice(0, 10)}</time></span>
            </div>
          </>
        )}
        <p>{modelMethodology}</p>
      </div>
    </details>
  );
}
