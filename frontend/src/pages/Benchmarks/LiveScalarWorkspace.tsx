import { useEffect, useState } from "react";
import { ArrowRight, Check, Circle, Loader2, ServerCog, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { api } from "../../api/client";
import type { AnalysisItem, ScalarCapabilities, ScalarCheckoutScope, ScalarEnlistmentItem, ScalarOperationItem } from "../../api/client";
import Button from "../../components/common/Button";
import { formatBytes, formatSeconds } from "./benchmarkPresentation";

const stageNames = [
  "Clone and check out the selected scope",
  "Write and verify the multi-pack-index",
  "Schedule Git maintenance",
];

const statusLabels = { pending: "Pending", running: "Running", completed: "Completed", failed: "Failed" };
const statusIcons = { pending: Circle, running: Loader2, completed: Check, failed: X };
type OperationStatus = ScalarOperationItem["status"];

function isActive(workspace: ScalarEnlistmentItem) {
  return workspace.setup_status === "running"
    || ["pending", "cloning", "optimizing"].includes(workspace.status)
    || workspace.operations.some(({ status }) => status === "pending" || status === "running");
}

function measuredTime(operations: (ScalarOperationItem | undefined)[]) {
  let total = 0;
  for (const operation of operations) {
    if (!operation?.started_at || !operation.completed_at) return null;
    const elapsed = Date.parse(operation.completed_at) - Date.parse(operation.started_at);
    if (!Number.isFinite(elapsed) || elapsed < 0) return null;
    total += elapsed;
  }
  return formatSeconds(total / 1_000, 2);
}

function WorkspaceStages({ workspace }: { workspace: ScalarEnlistmentItem | null }) {
  const operations = workspace?.operations ?? [];
  const clone = operations.find((item) => item.operation_type === "clone");
  const write = operations.find((item) => item.operation_type === "midx_write");
  const verify = operations.find((item) => item.operation_type === "midx_verify" && (!write || operations.indexOf(item) < operations.indexOf(write)));
  const maintenance = operations.find((item) => item.operation_type === "maintenance_start");
  let indexStatus: OperationStatus = verify?.status ?? write?.status ?? "pending";
  if (!verify && write?.status === "completed") {
    indexStatus = workspace?.setup_status === "failed" ? "failed" : "running";
  }
  const statuses = [clone?.status ?? "pending", indexStatus, maintenance?.status ?? "pending"] as const;
  const times = [measuredTime([clone]), measuredTime(write?.status === "failed" ? [write] : [write, verify]), measuredTime([maintenance])];

  return (
    <ol className="benchmark-workspace-stages" aria-label="Scalar setup stages" aria-live="polite">
      {stageNames.map((name, index) => {
        const status = statuses[index];
        const Icon = statusIcons[status];
        return (
          <li key={name}>
            <span className={`benchmark-workspace-stage-icon benchmark-stage-${status}`} aria-hidden="true">
              {workspace ? <Icon size={14} /> : index + 1}
            </span>
            <span>{name}</span>
            {workspace && (
              <span className={`benchmark-workspace-stage-status benchmark-stage-${status}`}>
                {statusLabels[status]}
                {times[index] && <code title="Recorded elapsed time"> · {times[index]}</code>}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function LiveScalarWorkspace({ analysis }: { analysis: AnalysisItem }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspace") ?? "";
  const [capabilities, setCapabilities] = useState<ScalarCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [scope, setScope] = useState<ScalarCheckoutScope>("root");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<ScalarEnlistmentItem | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollRetry, setPollRetry] = useState(0);
  const github = analysis.repository?.source === "github";

  useEffect(() => {
    if (!github) return;
    let cancelled = false;
    api.getScalarCapabilities().then((result) => {
      if (!cancelled) setCapabilities(result);
    }).catch(() => {
      if (!cancelled) setCapabilityError(true);
    });
    return () => { cancelled = true; };
  }, [github]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    let timer: number | undefined;
    setPollError(null);

    async function poll() {
      try {
        const result = await api.getScalarEnlistment(encodeURIComponent(workspaceId));
        if (cancelled) return;
        if (result.repository_id !== analysis.repository_id) {
          setPollError("This workspace belongs to a different repository.");
          return;
        }
        setWorkspace(result);
        if (isActive(result)) timer = window.setTimeout(poll, 1500);
      } catch (error) {
        if (!cancelled) setPollError(error instanceof Error ? error.message : "Unable to refresh the Scalar workspace.");
      }
    }

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workspaceId, analysis.repository_id, pollRetry]);

  const currentWorkspace = workspace?.id === workspaceId ? workspace : null;
  const active = currentWorkspace !== null && isActive(currentWorkspace);
  const displayedScope = active ? currentWorkspace.checkout_scope : scope;
  const loadingWorkspace = Boolean(workspaceId && !currentWorkspace && !pollError);

  const launch = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const job = await api.createScalarEnlistment(analysis.repository_id, scope);
      setWorkspace(job);
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("id", analysis.id);
        next.set("workspace", job.id);
        return next;
      }, { replace: true, preventScrollReset: true });
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Unable to start the Scalar workspace.");
    } finally {
      setLaunching(false);
    }
  };

  const fullCheckoutSupport = capabilities?.clone_options.full_clone;
  let capabilityNotice: string | undefined;
  if (!github) capabilityNotice = "Live Scalar workspaces are available for HTTPS GitHub repositories.";
  else if (capabilityError) capabilityNotice = "Unable to check this backend’s Scalar capabilities.";
  else if (!capabilities) capabilityNotice = "Checking Scalar capabilities…";
  else if (!capabilities.supported) capabilityNotice = capabilities.warnings.join(" ") || "This backend cannot run the Scalar setup workflow.";

  const fullCheckoutNotice = capabilities?.supported && fullCheckoutSupport !== true
    ? fullCheckoutSupport === false
      ? "This backend’s Scalar version does not support full working-tree checkout."
      : "Restart the GitOpt backend to check full working-tree checkout support."
    : undefined;
  const fullCheckoutDisabled = fullCheckoutSupport !== true;
  const launchDisabled = Boolean(capabilityNotice || launching || active || loadingWorkspace);
  const showDiskUsage = currentWorkspace && (currentWorkspace.git_bytes !== null || currentWorkspace.worktree_bytes !== null);

  return (
    <section className="panel benchmark-live" aria-labelledby="live-scalar-heading">
      <div className="benchmark-section-heading benchmark-live-heading">
        <ServerCog size={21} aria-hidden="true" />
        <div>
          <h2 id="live-scalar-heading">Live Scalar Workspace</h2>
          <p>Run on the GitOpt backend for {analysis.repository?.name ?? "the selected repository"}.</p>
        </div>
      </div>
      <div className="benchmark-grid benchmark-live-grid">
        <div className="benchmark-live-controls">
          <fieldset disabled={launchDisabled} className="benchmark-scope-selector">
            <legend>Initial checkout</legend>
            <div className="benchmark-scope-options">
              <label><input type="radio" name="checkout-scope" value="root" checked={displayedScope === "root"} onChange={() => setScope("root")} /> Root files only</label>
              <label><input type="radio" name="checkout-scope" value="full" checked={displayedScope === "full"} disabled={fullCheckoutDisabled} onChange={() => setScope("full")} aria-describedby={fullCheckoutNotice ? "full-checkout-notice" : undefined} /> Full working tree at HEAD</label>
            </div>
          </fieldset>
          {fullCheckoutNotice && <p id="full-checkout-notice" className="benchmark-helper">{fullCheckoutNotice}</p>}
          <div className="benchmark-actions">
            <Button onClick={launch} disabled={launchDisabled}>
              {launching ? "Starting Scalar…" : "Run Live Scalar Clone"} <ArrowRight size={15} aria-hidden="true" />
            </Button>
            {currentWorkspace && (
              <Link className="button button-secondary" to={`/scalar?id=${currentWorkspace.id}&analysisId=${analysis.id}`}>Workspace Details</Link>
            )}
          </div>
          {capabilityNotice && <p role="status" className="benchmark-helper">{capabilityNotice}</p>}
          {launchError && <p role="alert" className="benchmark-error-text">{launchError}</p>}
        </div>
        <div className="benchmark-live-progress">
          <h3>{currentWorkspace ? "Recorded operation status" : "Setup workflow"}</h3>
          {currentWorkspace && <p className="benchmark-helper">{currentWorkspace.checkout_scope === "full" ? "Full working tree at HEAD" : "Root files only"}</p>}
          <WorkspaceStages workspace={currentWorkspace} />
          {loadingWorkspace && <p className="benchmark-helper" role="status">Loading workspace status…</p>}
        </div>
      </div>
      {pollError && (
        <div className="benchmark-live-message">
          <p role="alert" className="benchmark-error-text">{pollError}</p>
          <Button variant="secondary" onClick={() => setPollRetry((retry) => retry + 1)}>Retry status check</Button>
        </div>
      )}
      {currentWorkspace?.error_message && <p role="alert" className="benchmark-live-message benchmark-error-text">{currentWorkspace.error_message}</p>}
      {showDiskUsage && (
        <dl className="benchmark-live-results" aria-label="Measured checkout sizes">
          {currentWorkspace.git_bytes !== null && <div><dt>.git at checkout</dt><dd>{formatBytes(currentWorkspace.git_bytes)}</dd></div>}
          {currentWorkspace.worktree_bytes !== null && <div><dt>Working tree at checkout</dt><dd>{formatBytes(currentWorkspace.worktree_bytes)}</dd></div>}
        </dl>
      )}
    </section>
  );
}
