import { useEffect, useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import { useNavigate } from "react-router";
import { api, AnalysisItem, ScalarCapabilities, ScalarCheckoutScope, UltraLargeComparison } from "../../api/client";
import Button from "../../components/common/Button";

function size(bytes: number | null) {
  if (bytes === null) return "Unavailable";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(3)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(3)} MB`;
  return `${bytes.toLocaleString()} bytes`;
}

function duration(seconds: number | null) {
  if (seconds === null) return "Unavailable";
  if (seconds < 1) return `${Math.round(seconds * 1_000)} ms`;
  const total = Math.round(seconds);
  return total >= 60 ? `${Math.floor(total / 60)}m ${total % 60}s` : `${total}s`;
}

export default function UltraLargeComparisonPanel({ analysis, reference }: {
  analysis: AnalysisItem;
  reference?: UltraLargeComparison;
}) {
  const navigate = useNavigate();
  const [capabilities, setCapabilities] = useState<ScalarCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [scope, setScope] = useState<ScalarCheckoutScope>("root");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
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

  const launch = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const job = await api.createScalarEnlistment(analysis.repository_id, scope);
      navigate(`/scalar?id=${job.id}&analysisId=${analysis.id}`);
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Unable to start the Scalar workspace");
    } finally {
      setLaunching(false);
    }
  };

  let capabilityNotice: string | undefined;
  if (!github) capabilityNotice = "Live Scalar workspaces are available for HTTPS GitHub repositories.";
  else if (capabilityError) capabilityNotice = "Unable to check this backend’s Scalar capabilities.";
  else if (!capabilities) capabilityNotice = "Checking Scalar capabilities…";
  else if (!capabilities.supported) capabilityNotice = capabilities.warnings.join(" ") || "This backend cannot run the Scalar setup workflow.";
  const fullCheckoutSupport = capabilities?.clone_options.full_clone;
  const fullCheckoutNotice = capabilities?.supported && fullCheckoutSupport !== true
    ? fullCheckoutSupport === false
      ? "This backend’s Scalar version does not support full working-tree checkout."
      : "The running backend has not reported full checkout support. Restart it with the current GitOpt version."
    : undefined;

  return (
    <>
      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Linux reference</h2>
        {reference ? (
          <>
            <p>
              {reference.repository} · {reference.branch} at <code>{reference.head_commit.slice(0, 12)}</code> · {reference.network_mbps} Mbps effective speed
            </p>
            <p>
              GitHub-reported repository size <strong>{(reference.repository_bytes / 1e9).toFixed(2)} GB</strong> ·
              {" "}Compressed history pack <strong>{size(reference.history_pack_bytes)}</strong>
            </p>
            <p>
              Size-based planning scenario <strong>{duration(reference.repository_bytes / (reference.network_mbps * 1_000_000 / 8))}</strong> if the transfer were the size reported by GitHub. Actual Git transfers use compressed packs.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 540, borderSpacing: "12px 8px", textAlign: "left" }}>
                <thead>
                  <tr>
                    <th scope="col">Checkout at HEAD</th>
                    <th scope="col">Logical files</th>
                    <th scope="col">Checkout pack</th>
                    <th scope="col">Checkout payload time</th>
                    <th scope="col">Partial-clone transfer estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {reference.scopes.map((entry) => (
                    <tr key={entry.scope}>
                      <th scope="row">{entry.scope === "root" ? "Root files" : "Full working tree"}</th>
                      <td>{size(entry.logical_checkout_bytes)}</td>
                      <td>{size(entry.checkout_pack_bytes)}</td>
                      <td>{duration(entry.checkout_transfer_seconds)}</td>
                      <td>{duration(entry.partial_transfer_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>Full-clone transfer estimate for this branch {duration(reference.full_clone_transfer_seconds)}.</p>
            {reference.scopes.some((entry) => entry.partial_transfer_seconds === null) && (
              <p>Partial-clone totals require a complete compressed history pack and the checkout pack for the selected scope. Live checkout options depend on the backend’s Scalar capabilities.</p>
            )}
            <details>
              <summary>Reference methodology</summary>
              <p>
                GitHub reports repository-wide storage. Logical checkout sizes sum tracked file bytes.
                The original rounded figures give 6.630 GB − 1.676 GB = 4.954 GB as an arithmetic example.
                Transfer estimates use completed Git packs and exclude server latency, checkout, MIDX, and scheduler time.
              </p>
              <p>
                Reference recorded {reference.collected_at.slice(0, 10)}. The root checkout pack used Git {reference.provenance.root_pack_bytes?.git_version ?? reference.git_version}.
              </p>
            </details>
          </>
        ) : <p>The running backend did not return the pinned Linux snapshot. If GitOpt was just updated, restart the backend to apply its migrations.</p>}
      </section>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Live Scalar workspace</h2>
        <p>GitOpt checks out HEAD on the backend, writes and verifies the multi-pack-index, then schedules Git maintenance.</p>
        <fieldset disabled={Boolean(capabilityNotice) || launching} style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
          <legend>Initial checkout</legend>
          <label style={{ display: "block", marginTop: 8 }}>
            <input type="radio" name="checkout-scope" checked={scope === "root"} onChange={() => setScope("root")} /> Root files only
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            <input type="radio" name="checkout-scope" checked={scope === "full"} onChange={() => setScope("full")} disabled={fullCheckoutSupport !== true} aria-describedby={fullCheckoutNotice ? "full-checkout-notice" : undefined} /> Full working tree at HEAD
          </label>
          {fullCheckoutNotice && <p id="full-checkout-notice">{fullCheckoutNotice}</p>}
        </fieldset>
        <Button onClick={launch} disabled={Boolean(capabilityNotice) || launching}>
          {launching ? <><Loader2 size={16} className="animate-spin" /> Starting…</> : <><Rocket size={16} /> Run live Scalar clone</>}
        </Button>
        {capabilityNotice && <p role="status" style={{ marginBottom: 0 }}>{capabilityNotice}</p>}
        {launchError && <p role="alert" style={{ color: "#f87171", marginBottom: 0 }}>{launchError}</p>}
      </section>
    </>
  );
}
