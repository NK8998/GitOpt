import {
  RuleEvaluationContext,
  RuleEvaluationResult,
  RuleDefinition,
  WorkloadSlug,
} from '../../types/rules';
import { RULE_THRESHOLDS } from '../../config/constants';

export class DeterministicRulesEngine {
  private rules: RuleDefinition[] = [];

  constructor() {
    this.registerRules();
  }

  private registerRules(): void {
    // --------------------------------------------------------------------------
    // WORKLOAD 1: ci_cd (CI/CD Pipelines)
    // --------------------------------------------------------------------------

    // Rule 1.1: Shallow Clone
    this.rules.push({
      id: 'RULE_CICD_SHALLOW_CLONE',
      workload: 'ci_cd',
      title: 'Shallow Clone (--depth 1)',
      category: 'clone',
      severity: 'high',
      evaluate: (ctx: RuleEvaluationContext) => {
        const commitCount = ctx.metrics.commit_count || 0;
        const threshold = RULE_THRESHOLDS.CI_CD_SHALLOW_CLONE_COMMIT_THRESHOLD;
        const matched = ctx.workloadSlug === 'ci_cd' && commitCount > threshold;
        const relevanceScore = matched
          ? Math.min(0.99, 0.8 + (commitCount - threshold) / (threshold * 3))
          : 0;

        const repoUrl = ctx.repositoryUrl || '<repository_url>';

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'CI/CD pipelines usually only require the latest commit. Fetching full commit history wastes bandwidth and execution time.',
          why_recommended:
            'Short-lived build nodes and test containers only require the tip of the commit tree to build and verify assets. Transferring full history is redundant.',
          advantages: [
            'Dramatically reduces initial git clone payload',
            'Slashes pipeline startup duration and runner cost',
            'Ideal for ephemeral containers and stateless runners',
          ],
          tradeoffs: [
            'Incompatible with tools needing full commit history (e.g. git merge-base, deep git log)',
            'Shallow clones cannot push back to remotes without un-shallowing',
          ],
          git_mechanism:
            'Truncates the commit graph traversal to the specified depth. Git server builds a packfile containing only the tree and blob objects referenced by the root commit tip.',
          impact_estimate: {
            metric_name: 'Commits in CI',
            current_value: `${commitCount.toLocaleString()} commits`,
            optimized_value: '1 commit',
            time_current: '12m 08s',
            time_optimized: '1m 15s',
            is_measured: false,
          },
          customizedTemplates: [
            {
              title: 'Execute Shallow Clone for CI Pipeline',
              content: `git clone --depth 1 ${repoUrl}`,
              format: 'shell',
            },
          ],
        };
      },
    });

    // Rule 1.2: Blobless Partial Clone
    this.rules.push({
      id: 'RULE_CICD_BLOBLESS_PARTIAL_CLONE',
      workload: 'ci_cd',
      title: 'Blobless Partial Clone (--filter=blob:none)',
      category: 'clone',
      severity: 'high',
      evaluate: (ctx: RuleEvaluationContext) => {
        const repoSize = ctx.metrics.repo_size_mb || 0;
        const commitCount = ctx.metrics.commit_count || 0;
        const sizeThreshold = RULE_THRESHOLDS.CI_CD_PARTIAL_CLONE_SIZE_MB;
        const matched = ctx.workloadSlug === 'ci_cd' && repoSize > sizeThreshold;

        const relevanceScore = matched
          ? Math.min(0.98, 0.82 + (repoSize - sizeThreshold) / 1000)
          : 0;

        const repoUrl = ctx.repositoryUrl || '<repository_url>';

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'Skips downloading file content objects until explicitly checked out, speeding up build initialization.',
          why_recommended:
            'The repository has significant historical blob data. CI jobs that only build or test targeted assets can avoid downloading historical or unused blobs.',
          advantages: [
            'Initial clone contains all commit history and trees without heavy file contents',
            'Blobs are fetched lazily on-demand during checkout',
            'Lower network transfer and disk consumption on test nodes',
          ],
          tradeoffs: [
            'Requires network connectivity during build if missing blobs are needed',
            'First access to large blobs introduces a network hop',
          ],
          git_mechanism:
            'Git instructs the server to omit blob objects during packfile negotiation. Only commits and trees are transferred initially; blobs are downloaded when checked out.',
          impact_estimate: {
            metric_name: 'Initial download',
            current_value: `${Math.round(repoSize)} MB`,
            optimized_value: `${Math.round(repoSize * 0.22)} MB`,
            time_current: '14m 20s',
            time_optimized: '3m 10s',
            is_measured: false,
          },
          customizedTemplates: [
            {
              title: 'Execute Blobless Clone for CI Pipeline',
              content: `git clone --filter=blob:none ${repoUrl}`,
              format: 'shell',
            },
          ],
        };
      },
    });

    // --------------------------------------------------------------------------
    // WORKLOAD 2: monorepo (Large Monorepo Development)
    // --------------------------------------------------------------------------

    // Rule 2.1: Sparse Checkout
    this.rules.push({
      id: 'RULE_MONOREPO_SPARSE_CHECKOUT',
      workload: 'monorepo',
      title: 'Sparse Checkout',
      category: 'checkout',
      severity: 'critical',
      evaluate: (ctx: RuleEvaluationContext) => {
        const fileCount = ctx.metrics.file_count || 0;
        const threshold = RULE_THRESHOLDS.MONOREPO_SPARSE_CHECKOUT_FILE_COUNT;
        const matched = ctx.workloadSlug === 'monorepo' || fileCount > 5000;

        const relevanceScore = matched
          ? Math.min(1.0, 0.85 + (fileCount - threshold) / 50000)
          : 0;

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'Populates only the directories relevant to the active workspace, reducing disk footprint and status scan delays.',
          why_recommended:
            'Most contributors in large repositories only modify a fraction of all directories. Materializing the entire working tree causes disk thrashing and slow git status scans.',
          advantages: [
            'Massively reduces file count in the local working tree',
            'Fast git status, git add, and filesystem indexing',
            'Eliminates IDE lockups on huge directories',
          ],
          tradeoffs: [
            'Files outside the sparse cone are invisible in local filesystem',
            'Running cross-package refactors requires re-expanding the sparse cone',
          ],
          git_mechanism:
            'Cone-mode sparse checkout uses prefix matching against the index, checking out only files under specified subdirectories while keeping the remaining index entries marked skip-worktree.',
          impact_estimate: {
            metric_name: 'Working tree files',
            current_value: `${fileCount.toLocaleString()}`,
            optimized_value: `${Math.round(fileCount * 0.18).toLocaleString()}`,
            time_current: '4.8s (status)',
            time_optimized: '0.4s (status)',
            is_measured: false,
          },
          customizedTemplates: [
            {
              title: 'Initialize Cone Sparse Checkout',
              content:
                'git sparse-checkout init --cone\ngit sparse-checkout set src/backend',
              format: 'shell',
            },
            {
              title: 'Recommended Gitconfig for Sparse Trees',
              content: `[core]\n\tsparseCheckout = true\n\tsparseCheckoutCone = true\n\tuntrackedCache = true`,
              format: 'gitconfig',
            },
          ],
        };
      },
    });

    // Rule 2.2: Treeless Partial Clone
    this.rules.push({
      id: 'RULE_MONOREPO_TREELESS_CLONE',
      workload: 'monorepo',
      title: 'Treeless Partial Clone (--filter=tree:0)',
      category: 'clone',
      severity: 'high',
      evaluate: (ctx: RuleEvaluationContext) => {
        const repoSize = ctx.metrics.repo_size_mb || 0;
        const threshold = RULE_THRESHOLDS.MONOREPO_TREELESS_CLONE_SIZE_MB;
        const matched = ctx.workloadSlug === 'monorepo' && repoSize > threshold;

        const relevanceScore = matched
          ? Math.min(0.99, 0.85 + (repoSize - threshold) / 2000)
          : 0;

        const repoUrl = ctx.repositoryUrl || '<repository_url>';

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'Clones only commit objects without trees or blobs, ideal for deep history analysis across huge monorepos.',
          why_recommended:
            'Massive monorepos have millions of historical tree entries. Treeless cloning downloads commits instantly, fetching trees and blobs strictly on checkout.',
          advantages: [
            'Super-fast initial clone of repositories with hundreds of thousands of commits',
            'Minimal initial storage footprint',
          ],
          tradeoffs: [
            'Branch switching and diffing commits requires downloading tree objects on demand',
            'Slightly slower than blobless clone during day-to-day active local coding',
          ],
          git_mechanism:
            'Filters out both tree and blob objects at the remote transport layer. Trees are pulled in batches as specific commit revisions are checked out.',
          impact_estimate: {
            metric_name: 'Clone size',
            current_value: `${Math.round(repoSize)} MB`,
            optimized_value: `${Math.round(repoSize * 0.12)} MB`,
            time_current: '26 min',
            time_optimized: '4m 30s',
            is_measured: false,
          },
          customizedTemplates: [
            {
              title: 'Execute Treeless Clone for Large Monorepo',
              content: `git clone --filter=tree:0 ${repoUrl}`,
              format: 'shell',
            },
          ],
        };
      },
    });

    // --------------------------------------------------------------------------
    // WORKLOAD 3: local_dev (Local Active Development)
    // --------------------------------------------------------------------------

    // Rule 3.1: Blobless Partial Clone for Active Work
    this.rules.push({
      id: 'RULE_LOCAL_DEV_BLOBLESS_CLONE',
      workload: 'local_dev',
      title: 'Blobless Partial Clone (--filter=blob:none)',
      category: 'clone',
      severity: 'high',
      evaluate: (ctx: RuleEvaluationContext) => {
        const repoSize = ctx.metrics.repo_size_mb || 0;
        const threshold = RULE_THRESHOLDS.LOCAL_DEV_PARTIAL_CLONE_SIZE_MB;
        const matched = ctx.workloadSlug === 'local_dev' && repoSize > 250;

        const relevanceScore = matched
          ? Math.min(0.98, 0.85 + (repoSize - threshold) / 1500)
          : 0;

        const repoUrl = ctx.repositoryUrl || '<repository_url>';

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'The repository contains significant blob data, while local development does not require all file contents immediately.',
          why_recommended:
            'Your repository contains a large amount of historical Git object and blob data. Developers rarely need all historical file revisions during everyday development.',
          advantages: [
            'Initial download size drops by 60%–80%',
            'Fast initial clone while retaining full commit history and fast local branch switching',
            'Reduced local disk usage',
          ],
          tradeoffs: [
            'Missing objects must be fetched from the remote when checking out very old commits',
            'Performance depends on network connection when viewing uncached historical blobs',
          ],
          git_mechanism:
            'Traditional clone downloads all commits, trees, and blobs. Blobless clone downloads commits and trees, but defers blob retrieval until a file is actually materialized.',
          impact_estimate: {
            metric_name: 'Initial download',
            current_value: `${(repoSize / 1024).toFixed(1)} GB`,
            optimized_value: `${((repoSize * 0.21) / 1024).toFixed(1)} GB`,
            time_current: '28 min',
            time_optimized: '8 min',
            is_measured: false,
          },
          customizedTemplates: [
            {
              title: 'Execute Blobless Clone for Local Development',
              content: `git clone --filter=blob:none \\\n  ${repoUrl}`,
              format: 'shell',
            },
          ],
        };
      },
    });

    // Rule 3.2: Cone Sparse Checkout for Local Dev
    this.rules.push({
      id: 'RULE_LOCAL_DEV_SPARSE_CHECKOUT',
      workload: 'local_dev',
      title: 'Enable Sparse Checkout',
      category: 'checkout',
      severity: 'medium',
      evaluate: (ctx: RuleEvaluationContext) => {
        const fileCount = ctx.metrics.file_count || 0;
        const matched = ctx.workloadSlug === 'local_dev' && fileCount > 8000;
        const relevanceScore = matched ? 0.88 : 0;

        return {
          matched,
          relevanceScore,
          reasoning:
            'Only a subset of the repository appears relevant to your active daily workflow.',
          why_recommended:
            'The codebase contains thousands of files across multiple modules. Materializing only the active project folders keeps working trees lean and responsive.',
          advantages: [
            'Faster git status, git diff, and branch switching',
            'Lower disk usage and cleaner directory layout in your editor',
          ],
          tradeoffs: [
            'Need to run git sparse-checkout add when navigating to other subsystems',
          ],
          git_mechanism:
            'Cone mode limits filesystem materialization to specified directories and their immediate parent tree hierarchy.',
          impact_estimate: {
            metric_name: 'Working tree files',
            current_value: `${fileCount.toLocaleString()}`,
            optimized_value: `${Math.round(fileCount * 0.2).toLocaleString()}`,
            time_current: '3.2s',
            time_optimized: '0.5s',
            is_measured: false,
          },
          customizedTemplates: [
            {
              title: 'Configure Sparse Checkout Cone',
              content:
                'git sparse-checkout init --cone\ngit sparse-checkout set src/backend',
              format: 'shell',
            },
          ],
        };
      },
    });

    // Rule 3.3: Filesystem Monitor / Maintenance
    this.rules.push({
      id: 'RULE_LOCAL_DEV_FSMONITOR',
      workload: 'local_dev',
      title: 'Git Maintenance & FS Monitor',
      category: 'filesystem',
      severity: 'medium',
      evaluate: (ctx: RuleEvaluationContext) => {
        const fileCount = ctx.metrics.file_count || 0;
        const threshold = RULE_THRESHOLDS.LOCAL_DEV_FSMONITOR_FILE_COUNT;
        const matched = ctx.workloadSlug === 'local_dev' && fileCount > 5000;

        const relevanceScore = matched
          ? Math.min(0.92, 0.75 + (fileCount - threshold) / 40000)
          : 0;

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'Large file trees slow down git status. Enabling FSMonitor and background maintenance speeds up change detection.',
          why_recommended:
            'Git status normally stats every file in the working tree. FSMonitor registers with the OS filesystem event daemon to only scan altered paths.',
          advantages: [
            'Sub-second git status and diff execution on huge trees',
            'Automated hourly background index optimization and packfile repacking',
          ],
          tradeoffs: [
            'Runs an unobtrusive background daemon process on the developer machine',
          ],
          git_mechanism:
            'Leverages native OS file change notifications (inotify on Linux, FSEvents on macOS, ReadDirectoryChangesW on Windows) to skip inspecting clean directories.',
          impact_estimate: {
            metric_name: 'Git status latency',
            current_value: '2.4s',
            optimized_value: '0.08s',
            time_current: '2.4s',
            time_optimized: '0.08s',
            is_measured: false,
          },
          customizedTemplates: [
            {
              title: 'Enable Git FSMonitor and Background Maintenance',
              content: 'git config core.fsmonitor true\ngit maintenance start',
              format: 'shell',
            },
          ],
        };
      },
    });
  }

  /**
   * Evaluate deterministic rules against given workload and metrics
   */
  public evaluate(context: RuleEvaluationContext): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];

    // Filter rules relevant to current workload
    const workloadRules = this.rules.filter((r) => r.workload === context.workloadSlug);

    for (const rule of workloadRules) {
      const evaluation = rule.evaluate(context);
      if (evaluation.matched) {
        results.push({
          ruleId: rule.id,
          matched: true,
          title: rule.title,
          category: rule.category,
          severity: rule.severity,
          relevanceScore: evaluation.relevanceScore,
          reasoning: evaluation.reasoning,
          description: evaluation.reasoning,
          why_recommended: evaluation.why_recommended,
          advantages: evaluation.advantages,
          tradeoffs: evaluation.tradeoffs,
          git_mechanism: evaluation.git_mechanism,
          impact_estimate: evaluation.impact_estimate,
          templates: evaluation.customizedTemplates,
        });
      }
    }

    // Sort by relevance score descending
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

export const rulesEngine = new DeterministicRulesEngine();
