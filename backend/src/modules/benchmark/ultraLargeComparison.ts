import { pgPool } from '../../config/database';
import { UltraLargeComparisonDTO } from '../../types/benchmark';

export const linuxReference = {
  repository: 'torvalds/linux',
  branch: 'master',
  commit: '4405c18c95d2d0f99f6c581ef0ee8591a1aa6ccd',
};

const networkMbps = 100;
const bytesPerSecond = networkMbps * 1_000_000 / 8;

function transferSeconds(bytes: number | null): number | null {
  return bytes === null ? null : bytes / bytesPerSecond;
}

export async function getUltraLargeComparison(): Promise<UltraLargeComparisonDTO | undefined> {
  const { rows: [snapshot] } = await pgPool.query(
    `SELECT * FROM ultra_large_snapshots WHERE repository = $1 AND branch = $2 AND head_commit = $3`,
    [linuxReference.repository, linuxReference.branch, linuxReference.commit]
  );
  if (!snapshot) return undefined;
  const historyBytes = snapshot.history_pack_bytes === null ? null : Number(snapshot.history_pack_bytes);
  const fullCloneBytes = snapshot.full_clone_pack_bytes === null ? null : Number(snapshot.full_clone_pack_bytes);

  function checkoutScope(scope: 'root' | 'full', logicalBytes: string, packBytes: string | null) {
    const checkoutBytes = packBytes === null ? null : Number(packBytes);
    return {
      scope,
      logical_checkout_bytes: Number(logicalBytes),
      checkout_pack_bytes: checkoutBytes,
      checkout_transfer_seconds: transferSeconds(checkoutBytes),
      partial_transfer_seconds: historyBytes === null || checkoutBytes === null
        ? null
        : transferSeconds(historyBytes + checkoutBytes),
    };
  }

  return {
    network_mbps: networkMbps,
    repository: snapshot.repository,
    branch: snapshot.branch,
    head_commit: snapshot.head_commit,
    tree_sha: snapshot.tree_sha,
    collected_at: new Date(snapshot.collected_at).toISOString(),
    git_version: snapshot.git_version,
    provenance: snapshot.provenance,
    repository_bytes: Number(snapshot.repository_bytes),
    history_pack_bytes: historyBytes,
    full_clone_pack_bytes: fullCloneBytes,
    full_clone_transfer_seconds: transferSeconds(fullCloneBytes),
    scopes: [
      checkoutScope('root', snapshot.root_checkout_bytes, snapshot.root_pack_bytes),
      checkoutScope('full', snapshot.full_checkout_bytes, snapshot.full_checkout_pack_bytes),
    ],
  };
}
