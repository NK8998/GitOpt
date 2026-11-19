import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pgPool } from '../src/config/database';
import { env } from '../src/config/env';
import { githubMetricsService } from '../src/modules/analysis/githubMetrics.service';
import { linuxReference } from '../src/modules/benchmark/ultraLargeComparison';
import { scalarExecutor } from '../src/modules/scalar/scalar.executor';
import { sanitizeCommandOutput, workspaceRoot } from '../src/modules/scalar/scalar.validation';

const packColumns = {
  history: 'history_pack_bytes',
  root: 'root_pack_bytes',
  full: 'full_checkout_pack_bytes',
  'full-clone': 'full_clone_pack_bytes',
} as const;
type PackPhase = keyof typeof packColumns;
type Phase = 'tree' | PackPhase;
const { repository, branch, commit } = linuxReference;
const keys = [repository, branch, commit];
const url = `https://github.com/${repository}.git`;

async function reportOutcome(phase: Phase, status: 'completed' | 'failed', reason?: string) {
  await pgPool.query(
    `UPDATE ultra_large_snapshots
     SET collection_outcomes = collection_outcomes || $4::jsonb
     WHERE repository = $1 AND branch = $2 AND head_commit = $3`,
    [...keys, JSON.stringify({ [phase]: { status, reason, collected_at: new Date().toISOString() } })]
  );
}

async function refreshTree() {
  const tree = await githubMetricsService.collectCheckoutSnapshot(url, commit, true);
  const collectedAt = new Date().toISOString();
  const provenance = {
    repository_bytes: { source: 'github_repository_metadata', collected_at: collectedAt },
    root_checkout_bytes: { source: 'github_tree', collected_at: collectedAt },
    full_checkout_bytes: { source: 'github_tree', collected_at: collectedAt },
  };
  await pgPool.query(
    `UPDATE ultra_large_snapshots
     SET tree_sha = $4, repository_bytes = $5, root_checkout_bytes = $6, full_checkout_bytes = $7,
         provenance = provenance || $8::jsonb
     WHERE repository = $1 AND branch = $2 AND head_commit = $3`,
    [...keys, tree.treeSha, tree.repositoryBytes, tree.rootBytes, tree.fullBytes, JSON.stringify(provenance)]
  );
  console.log(`Collected logical checkout sizes for ${repository} at ${commit}`);
}

async function collectPack(phase: PackPhase, diagnostics: boolean) {
  await fs.mkdir(workspaceRoot(), { recursive: true });
  const cwd = await fs.mkdtemp(path.join(workspaceRoot(), '.snapshot-'));
  const traceId = randomUUID();
  console.log(`Collecting ${phase} pack for ${repository} at ${commit}, trace ${traceId}`);

  try {
    const setup = await scalarExecutor.run('git', ['init', '--bare', '--quiet'], { cwd });
    if (!setup.ok) throw new Error(setup.failureReason || setup.stderr || 'Unable to initialize pack repository');

    const wantBlobs = phase === 'root' || phase === 'full';
    const input = wantBlobs
      ? await githubMetricsService.collectCheckoutSnapshot(url, commit, phase === 'full').then((tree) =>
        (phase === 'root' ? tree.rootBlobs : tree.fullBlobs).join('\n') + '\n'
      )
      : undefined;
    const filtered = phase !== 'full-clone';
    const args = ['-c', 'maintenance.auto=false', '-c', 'fetch.unpackLimit=0', '-c', `remote.origin.url=${url}`];
    if (filtered) {
      args.push('-c', 'remote.origin.promisor=true', '-c', 'remote.origin.partialclonefilter=blob:none');
    }
    args.push('fetch', '--no-tags');
    if (filtered) args.push('--filter=blob:none');
    if (wantBlobs) args.push('--stdin', '--no-write-fetch-head');
    args.push('origin');
    if (!wantBlobs) args.push(commit);

    const result = await scalarExecutor.run('git', args, {
      cwd,
      traceId,
      diagnostics,
      input,
      budget: {
        workspacePath: cwd,
        deadline: Date.now() + env.SCALAR_COMMAND_TIMEOUT_MS,
        maxBytes: env.SCALAR_WORKSPACE_MAX_BYTES,
      },
    });
    if (!result.ok) throw new Error(result.failureReason || result.stderr || 'Git fetch failed');
    if (filtered && /filtering not recognized|filter.*ignored/i.test(result.stderr)) {
      throw new Error('The remote did not honor the blobless filter');
    }

    if (!wantBlobs) {
      const head = await scalarExecutor.run('git', ['rev-parse', '--verify', 'FETCH_HEAD'], { cwd });
      if (!head.ok || head.stdout.trim() !== commit) throw new Error('Git fetched a different commit than requested');
    }

    const packDirectory = path.join(cwd, 'objects', 'pack');
    const names = await fs.readdir(packDirectory);
    const packs = names.filter((name) => name.endsWith('.pack'));
    if (filtered && packs.some((name) => !names.includes(name.replace(/\.pack$/, '.promisor')))) {
      throw new Error('The filtered fetch produced a pack without a promisor marker');
    }
    const sizes = await Promise.all(packs.map(async (name) => (await fs.stat(path.join(packDirectory, name))).size));
    const packBytes = sizes.reduce((total, size) => total + size, 0);
    if (packBytes === 0) throw new Error('The completed fetch produced no pack data');

    const version = await scalarExecutor.run('git', ['--version']);
    if (!version.ok) throw new Error('Unable to determine the Git version used for collection');
    const column = packColumns[phase];
    const provenance = {
      [column]: { source: 'git_pack', git_version: version.stdout.trim().replace(/^git version /, ''), collected_at: new Date().toISOString() },
    };
    await pgPool.query(
      `UPDATE ultra_large_snapshots SET ${column} = $4, provenance = provenance || $5::jsonb
       WHERE repository = $1 AND branch = $2 AND head_commit = $3`,
      [...keys, packBytes, JSON.stringify(provenance)]
    );
    console.log(`Stored ${packBytes} pack bytes`);
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

async function main() {
  const [arg = 'history', diagnosticOption, ...rest] = process.argv.slice(2);
  if ((arg !== 'tree' && !Object.hasOwn(packColumns, arg)) || (diagnosticOption && diagnosticOption !== '--diagnostics') || rest.length) {
    throw new Error('Usage: npm run collect:ultra-large -- [tree|history|root|full|full-clone] [--diagnostics]');
  }
  const phase = arg as Phase;
  try {
    if (phase === 'tree') await refreshTree();
    else await collectPack(phase, diagnosticOption === '--diagnostics');
    await reportOutcome(phase, 'completed');
  } catch (error) {
    const reason = sanitizeCommandOutput(error instanceof Error ? error.message : String(error));
    await reportOutcome(phase, 'failed', reason);
    throw new Error(reason);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pgPool.end());
