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

        // Score scales with historical commit bloat (0.80 to 0.99)
        const relevanceScore = matched
          ? Math.min(0.99, 0.8 + (commitCount - threshold) / (threshold * 3))
          : 0;

        const repoUrl = ctx.repositoryUrl || '<repository_url>';

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'CI/CD pipelines usually only require the latest commit. Fetching full commit history wastes bandwidth and execution time.',
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
        const commitThreshold = RULE_THRESHOLDS.CI_CD_SHALLOW_CLONE_COMMIT_THRESHOLD;

        const matched =
          ctx.workloadSlug === 'ci_cd' &&
          repoSize > sizeThreshold &&
          commitCount <= commitThreshold;

        const relevanceScore = matched
          ? Math.min(0.98, 0.82 + (repoSize - sizeThreshold) / 1000)
          : 0;

        const repoUrl = ctx.repositoryUrl || '<repository_url>';

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'Skips downloading file content objects until explicitly checked out, speeding up build initialization.',
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
        const matched = ctx.workloadSlug === 'monorepo' && fileCount > threshold;

        const relevanceScore = matched
          ? Math.min(1.0, 0.85 + (fileCount - threshold) / 50000)
          : 0;

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'Populates only the directories relevant to the current task, reducing disk footprint and status scan delays.',
          customizedTemplates: [
            {
              title: 'Initialize Cone Sparse Checkout',
              content:
                'git sparse-checkout init --cone && git sparse-checkout set <directory_path>',
              format: 'shell',
            },
            {
              title: 'Recommended Gitconfig Optimization for Sparse Trees',
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
            'Clones only the commit history without trees/blobs, ideal for deep history analysis across huge monorepos.',
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
        const matched = ctx.workloadSlug === 'local_dev' && repoSize > threshold;

        const relevanceScore = matched
          ? Math.min(0.96, 0.82 + (repoSize - threshold) / 1500)
          : 0;

        const repoUrl = ctx.repositoryUrl || '<repository_url>';

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'Downloads full commit history and tree structures so local git log/branch switching is fast, while downloading blob data on demand.',
          customizedTemplates: [
            {
              title: 'Execute Blobless Clone for Developer Machine',
              content: `git clone --filter=blob:none ${repoUrl}`,
              format: 'shell',
            },
          ],
        };
      },
    });

    // Rule 3.2: Filesystem Monitor / Maintenance
    this.rules.push({
      id: 'RULE_LOCAL_DEV_FSMONITOR',
      workload: 'local_dev',
      title: 'Git Maintenance & FS Monitor',
      category: 'filesystem',
      severity: 'medium',
      evaluate: (ctx: RuleEvaluationContext) => {
        const fileCount = ctx.metrics.file_count || 0;
        const threshold = RULE_THRESHOLDS.LOCAL_DEV_FSMONITOR_FILE_COUNT;
        const matched = ctx.workloadSlug === 'local_dev' && fileCount > threshold;

        const relevanceScore = matched
          ? Math.min(0.95, 0.8 + (fileCount - threshold) / 40000)
          : 0;

        return {
          matched,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          reasoning:
            'Large file trees slow down git status. Enabling FSMonitor speeds up working-tree change detection.',
          customizedTemplates: [
            {
              title: 'Enable Git FSMonitor',
              content: 'git config core.fsmonitor true',
              format: 'shell',
            },
            {
              title: 'Enable Automated Background Git Maintenance',
              content: 'git maintenance start',
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
          templates: evaluation.customizedTemplates,
        });
      }
    }

    // Sort by relevance score descending
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

export const rulesEngine = new DeterministicRulesEngine();
