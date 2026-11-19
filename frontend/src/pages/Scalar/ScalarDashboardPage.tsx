import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  GitBranch,
  Loader2,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import Button from "../../components/common/Button";
import { api, ScalarEnlistmentItem } from "../../api/client";

const stageLabels = {
  clone: "Checkout at HEAD",
  midx_write: "Write MIDX",
  midx_verify: "Verify MIDX",
  maintenance_start: "Schedule maintenance",
};

function boolLabel(value: boolean | null) {
  if (value === null) return "Unknown";
  return value ? "Enabled" : "Disabled";
}

function measuredBytes(value: number | null) {
  if (value === null) return "Pending";
  return value >= 1e9 ? `${(value / 1e9).toFixed(3)} GB` : `${(value / 1e6).toFixed(3)} MB`;
}

export default function ScalarDashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const enlistmentId = searchParams.get("id") || "";
  const analysisId = searchParams.get("analysisId") || "";
  const [item, setItem] = useState<ScalarEnlistmentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"maintenance" | "midx" | null>(null);

  const load = async () => {
    if (!enlistmentId) {
      setError("No Scalar enlistment ID was supplied.");
      return;
    }
    try {
      const result = await api.getScalarEnlistment(enlistmentId);
      setItem(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Scalar enlistment");
    }
  };

  useEffect(() => {
    void load();
  }, [enlistmentId]);

  const hasActiveOperation = useMemo(
    () => item?.operations.some((operation) => operation.status === "pending" || operation.status === "running") ?? false,
    [item]
  );
  const setupRunning = item?.setup_status === "running";

  useEffect(() => {
    if (!setupRunning && !hasActiveOperation && !["pending", "cloning", "optimizing"].includes(item?.status ?? "")) return;
    const timer = window.setInterval(() => void load(), 1500);
    return () => window.clearInterval(timer);
  }, [item?.status, setupRunning, hasActiveOperation, enlistmentId]);

  const startMaintenance = async () => {
    if (!item) return;
    setAction("maintenance");
    setError(null);
    try {
      await api.startScalarMaintenance(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start maintenance");
    } finally {
      setAction(null);
    }
  };

  const optimize = async () => {
    if (!item) return;
    setAction("midx");
    setError(null);
    try {
      await api.optimizeScalarMidx(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start MIDX optimization");
    } finally {
      setAction(null);
    }
  };

  if (!item && !error) {
    return <div className="page"><div className="page-heading"><h1>Loading Scalar workspace…</h1></div></div>;
  }

  if (!item) {
    return <div className="page"><div className="page-heading"><h1>Scalar workspace unavailable</h1><p>{error}</p></div></div>;
  }

  const ready = ["ready", "optimized"].includes(item.status);
  const cloning = ["pending", "cloning"].includes(item.status);
  const lastOperation = item.operations[0];
  const activeStage = item.operations.find((operation) => ["pending", "running"].includes(operation.status));
  const failed = item.status === "failed" || lastOperation?.status === "failed" || Boolean(item.error_message);

  return (
    <div className="page">
      <div className="page-heading split-heading">
        <div>
          <div className="eyebrow">ULTRA-LARGE REPOSITORY MODE</div>
          <h1>Scalar workspace</h1>
          <p>Managed backend workspace for partial-clone, sparse-checkout, maintenance and multi-pack-index optimization.</p>
        </div>
        <span className="analysis-id">SCALAR&nbsp; {item.id.slice(0, 8).toUpperCase()}</span>
      </div>

      {error && (
        <div style={{ padding: 14, marginBottom: 18, borderRadius: 8, border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.08)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {(setupRunning || cloning) && (
        <section className="panel" style={{ padding: 22, marginBottom: 18, display: "flex", gap: 14, alignItems: "center" }}>
          <Loader2 className="animate-spin" size={22} />
          <div>
            <strong>{activeStage ? stageLabels[activeStage.operation_type] : "Preparing the next Scalar stage"}</strong>
            <div style={{ color: "var(--text-muted)", marginTop: 4 }}>Checkout, MIDX verification, and maintenance scheduling run in order.</div>
          </div>
        </section>
      )}

      {ready && !setupRunning && !item.maintenance_enabled && (item.midx_verified || !item.setup_status) && (
        <section className="panel" style={{ padding: 22, marginBottom: 18, border: "1px solid rgba(96,165,250,.45)" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <ServerCog size={22} />
            <div style={{ flex: 1 }}>
              <strong>Repository cloned in Ultra-Large mode.</strong>
              <p style={{ color: "var(--text-muted)", marginBottom: 14 }}>The working tree is ready. Partial-clone objects may still be fetched on demand, and scheduled Git maintenance is not enabled yet.</p>
              <Button onClick={startMaintenance} disabled={hasActiveOperation || action !== null}>
                {action === "maintenance" ? <><Loader2 size={15} className="animate-spin" /> Scheduling…</> : <><RefreshCw size={15} /> Schedule maintenance</>}
              </Button>
            </div>
          </div>
        </section>
      )}

      {failed && (
        <section className="panel" style={{ padding: 22, marginBottom: 18, border: "1px solid rgba(239,68,68,.45)" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <AlertTriangle size={21} />
            <div>
              <strong>{lastOperation?.status === "failed" ? `${stageLabels[lastOperation.operation_type]} failed` : "Scalar operation failed"}</strong>
              <p style={{ color: "var(--text-muted)" }}>{item.error_message || lastOperation?.error_message || "No additional error information was recorded."}</p>
            </div>
          </div>
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginBottom: 20 }}>
        {([
          ["Workspace", item.status, GitBranch],
          ["Partial clone", boolLabel(item.partial_clone_enabled), Database],
          ["FSMonitor", boolLabel(item.fsmonitor_enabled), ShieldCheck],
          ["MIDX", item.midx_verified ? "Verified" : item.midx_written ? "Written" : "Not optimized", Wrench],
        ] as const).map(([label, value, Icon]) => {
          return (
            <section className="panel" key={String(label)} style={{ padding: 18 }}>
              <Icon size={18} />
              <small style={{ display: "block", color: "var(--text-muted)", marginTop: 12 }}>{label}</small>
              <strong style={{ display: "block", marginTop: 5, textTransform: label === "Workspace" ? "capitalize" : undefined }}>{String(value)}</strong>
            </section>
          );
        })}
      </div>

      <section className="panel" style={{ padding: 22, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Workspace state</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 14 }}>
          <div><span style={{ color: "var(--text-muted)" }}>Scalar version</span><strong style={{ display: "block", marginTop: 4 }}>{item.scalar_version || "Unknown"}</strong></div>
          <div><span style={{ color: "var(--text-muted)" }}>Git version</span><strong style={{ display: "block", marginTop: 4 }}>{item.git_version || "Unknown"}</strong></div>
          <div><span style={{ color: "var(--text-muted)" }}>Transport</span><strong style={{ display: "block", marginTop: 4 }}>{item.partial_clone_enabled === false ? "GitHub full-clone fallback" : "GitHub partial clone"}</strong></div>
          <div><span style={{ color: "var(--text-muted)" }}>Checkout scope</span><strong style={{ display: "block", marginTop: 4 }}>{item.checkout_scope === "full" ? "Full working tree at HEAD" : "Root files at HEAD"}</strong></div>
          <div><span style={{ color: "var(--text-muted)" }}>Sparse checkout</span><strong style={{ display: "block", marginTop: 4 }}>{boolLabel(item.sparse_checkout_enabled)}</strong></div>
          <div><span style={{ color: "var(--text-muted)" }}>Maintenance</span><strong style={{ display: "block", marginTop: 4 }}>{item.maintenance_enabled ? "Scheduled" : "Not scheduled"}</strong></div>
          <div><span style={{ color: "var(--text-muted)" }}>.git at checkout</span><strong style={{ display: "block", marginTop: 4 }}>{measuredBytes(item.git_bytes)}</strong></div>
          <div><span style={{ color: "var(--text-muted)" }}>Working tree at checkout</span><strong style={{ display: "block", marginTop: 4 }}>{measuredBytes(item.worktree_bytes)}</strong></div>
          {item.head_commit && <div><span style={{ color: "var(--text-muted)" }}>HEAD commit</span><code title={item.head_commit} style={{ display: "block", marginTop: 4 }}>{item.head_commit.slice(0, 12)}</code></div>}
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <small style={{ color: "var(--text-muted)" }}>Managed worktree</small>
          <code style={{ display: "block", marginTop: 6, overflowWrap: "anywhere" }}>{item.worktree_path || item.workspace_path}</code>
        </div>
      </section>

      <section className="panel" style={{ padding: 22, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Object lookup optimization</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 0 }}>Write and verify the repository multi-pack-index. Verification is recorded as a separate operation.</p>
          </div>
          <Button onClick={optimize} disabled={!ready || setupRunning || hasActiveOperation || action !== null}>
            {action === "midx" ? <><Loader2 size={15} className="animate-spin" /> Optimizing…</> : <><Wrench size={15} /> {item.midx_verified ? "Re-run MIDX" : "Optimize repository"}</>}
          </Button>
        </div>
      </section>

      <section className="panel" style={{ padding: 22, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Operation history</h2>
        {item.operations.length === 0 ? <p>No operations recorded.</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {item.operations.map((operation) => (
              <div key={operation.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span><strong>{stageLabels[operation.operation_type]}</strong><small style={{ display: "block", color: "var(--text-muted)", marginTop: 3 }}>{operation.output || operation.error_message || "No command output"}</small></span>
                <span style={{ textTransform: "uppercase", fontSize: 12 }}>
                  {operation.status}
                  {operation.started_at && operation.completed_at && ` · ${((Date.parse(operation.completed_at) - Date.parse(operation.started_at)) / 1000).toFixed(2)}s`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <Button variant="secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</Button>
        {analysisId && <Button onClick={() => navigate(`/benchmarks?id=${analysisId}&mode=ultra-large`)}>View strategy comparison <ArrowRight size={15} /></Button>}
      </div>

      <p style={{ color: "var(--text-muted)", marginTop: 18, fontSize: 13 }}>
        This workspace exists on the GitOpt backend host. It does not create or modify a checkout on your personal computer.
      </p>
    </div>
  );
}
