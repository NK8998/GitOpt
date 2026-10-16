import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { db } from '../../config/database';
import {
  AnalysisRecord,
  ExtractedMetrics,
  LargestObjectInfo,
  MetricDTO,
  MetricSource,
  ObjectDistribution,
} from '../../types/metrics';
import { AppError } from '../../middleware/errorHandler';
import { recommendationService } from '../recommendation/recommendation.service';
import { benchmarkService } from '../benchmark/benchmark.service';
import { githubMetricsService } from './githubMetrics.service';

const execPromise = util.promisify(exec);

export interface TriggerAnalysisInput {
  repository_id: string;
  simulated_metrics?: Partial<ExtractedMetrics>;
  advanced_options?: Record<string, boolean>;
}

interface CollectionResult {
  metrics: ExtractedMetrics;
  objectDistribution: ObjectDistribution;
  largestObjects: LargestObjectInfo[];
  metricSource: MetricSource;
  metricNotes: string[];
  defaultBranch?: string;
  treeTruncated?: boolean;
}

export class AnalysisService {
  async triggerAnalysis(input: TriggerAnalysisInput): Promise<AnalysisRecord> {
    await db.init();

    const repository = await db.getRepositoryById(input.repository_id);
    if (!repository) {
      throw new AppError(`Repository with ID '${input.repository_id}' not found`, 404);
    }

    const startTime = Date.now();
    const analysis = await db.createAnalysis({
      repository_id: input.repository_id,
      status: 'analyzing',
      current_stage: 'discovery',
      progress_percent: 10,
    });

    try {
      await db.updateAnalysis(analysis.id, {
        current_stage: 'metadata',
        progress_percent: 25,
      });

      const collected = await this.collectMetrics(repository.url_path, repository.source, input);

      await db.updateAnalysis(analysis.id, {
        current_stage: 'metrics',
        progress_percent: 60,
      });

      const savedMetrics = await this.persistMetrics(analysis.id, collected.metrics);
      const optimizationScore = this.calculateOpportunityScore(collected.metrics);

      await db.updateAnalysis(analysis.id, {
        current_stage: 'recommendations',
        progress_percent: 80,
        metric_source: collected.metricSource,
        metric_notes: collected.metricNotes,
        default_branch: collected.defaultBranch,
        tree_truncated: collected.treeTruncated,
        object_distribution: collected.objectDistribution,
        largest_objects: collected.largestObjects,
        optimization_score: optimizationScore,
      });

      // Recommendations are deterministic and use only the measured/derived metric set.
      await recommendationService.evaluate(analysis.id);

      // Benchmarks are currently modelled estimates. The benchmark service keeps them
      // separate from observed repository metrics and the UI labels them accordingly.
      try {
        await benchmarkService.generateBenchmarks(analysis.id);
      } catch (err) {
        console.warn('Benchmark generation warning:', err);
      }

      const durationMs = Date.now() - startTime;
      const completedAnalysis = await db.updateAnalysis(analysis.id, {
        status: 'completed',
        current_stage: 'completed',
        progress_percent: 100,
        duration_ms: durationMs,
      });

      return {
        ...completedAnalysis,
        metrics: savedMetrics,
        repository,
      };
    } catch (error) {
      console.error('Git analysis error:', error);
      await db.updateAnalysis(analysis.id, {
        status: 'failed',
        current_stage: 'failed',
        duration_ms: Date.now() - startTime,
      });

      if (error instanceof AppError) throw error;
      throw new AppError(
        `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async getAnalysisById(id: string): Promise<AnalysisRecord> {
    await db.init();
    const analysis = await db.getAnalysisById(id);
    if (!analysis) {
      throw new AppError(`Analysis with ID '${id}' not found`, 404);
    }
    return analysis;
  }

  async getAllAnalyses(): Promise<AnalysisRecord[]> {
    await db.init();
    return db.getAllAnalyses();
  }

  private async collectMetrics(
    urlOrPath: string,
    source: string,
    input: TriggerAnalysisInput
  ): Promise<CollectionResult> {
    if (input.simulated_metrics && Object.keys(input.simulated_metrics).length > 0) {
      if (process.env.NODE_ENV !== 'test') {
        throw new AppError('simulated_metrics is only supported in the test environment.', 400);
      }
      return this.buildTestMetrics(input.simulated_metrics);
    }

    if (source === 'github') {
      const result = await githubMetricsService.collect(urlOrPath);
      return {
        metrics: result.metrics,
        objectDistribution: result.objectDistribution,
        largestObjects: result.largestObjects,
        metricSource: result.metricSource,
        metricNotes: result.metricNotes,
        defaultBranch: result.defaultBranch,
        treeTruncated: result.treeTruncated,
      };
    }

    if (source === 'local' || urlOrPath.startsWith('file://')) {
      return this.collectLocalMetrics(urlOrPath);
    }

    throw new AppError(
      `Repository source '${source}' is not supported by the analyzer yet. GitHub and local Git repositories are currently supported.`,
      400
    );
  }

  private async collectLocalMetrics(urlOrPath: string): Promise<CollectionResult> {
    let localPath = urlOrPath;
    if (localPath.startsWith('file://')) {
      localPath = localPath.replace('file://', '');
    }

    if (!fs.existsSync(localPath) || !fs.statSync(localPath).isDirectory()) {
      throw new AppError(`Local repository path '${localPath}' does not exist.`, 404);
    }

    try {
      await execPromise('git rev-parse --is-inside-work-tree', { cwd: localPath, timeout: 5000 });
    } catch {
      throw new AppError(`Path '${localPath}' is not a Git working tree.`, 400);
    }

    const [commitResult, filesResult, branchesResult, countObjectsResult, branchResult] = await Promise.all([
      execPromise('git rev-list --count HEAD', { cwd: localPath, timeout: 15000 }),
      execPromise('git ls-files -z', { cwd: localPath, timeout: 15000, maxBuffer: 20 * 1024 * 1024 }),
      execPromise('git for-each-ref --format="%(refname)" refs/heads', { cwd: localPath, timeout: 10000 }),
      execPromise('git count-objects -v', { cwd: localPath, timeout: 10000 }),
      execPromise('git branch --show-current', { cwd: localPath, timeout: 5000 }),
    ]);

    const files = filesResult.stdout.split('\0').filter(Boolean);
    const fileEntries: LargestObjectInfo[] = [];
    let currentTreeBytes = 0;
    let largeFileCount = 0;
    const largeThresholdBytes = 10 * 1024 * 1024;

    for (const relativePath of files) {
      const absolutePath = path.resolve(localPath, relativePath);
      try {
        const stat = fs.statSync(absolutePath);
        if (!stat.isFile()) continue;
        currentTreeBytes += stat.size;
        if (stat.size >= largeThresholdBytes) largeFileCount += 1;
        fileEntries.push({
          name: path.basename(relativePath),
          size_mb: this.bytesToMb(stat.size),
          type: 'Blob',
          path: relativePath,
        });
      } catch {
        // Skip files that are absent from the current checkout (for example sparse paths).
      }
    }

    fileEntries.sort((a, b) => b.size_mb - a.size_mb);
    const largestObjects = fileEntries.slice(0, 10);
    const countData = this.parseCountObjects(countObjectsResult.stdout);
    const repoSizeMb = Math.round(((countData.size + countData['size-pack']) / 1024) * 10) / 10;
    const objectCount = countData.count + countData['in-pack'];
    const commitCount = Number.parseInt(commitResult.stdout.trim(), 10) || 0;
    const branchCount = branchesResult.stdout.split('\n').filter(Boolean).length;

    return {
      metrics: {
        repo_size_mb: repoSizeMb,
        commit_count: commitCount,
        file_count: files.length,
        large_file_count: largeFileCount,
        branch_count: branchCount,
        git_objects_count: objectCount,
        largest_object_mb: largestObjects[0]?.size_mb || 0,
        largest_object_path: largestObjects[0]?.path || '',
        estimated_clone_min: this.estimateCloneMinutes(repoSizeMb),
        current_tree_blob_mb: this.bytesToMb(currentTreeBytes),
      },
      objectDistribution: {
        blobs_mb: this.bytesToMb(currentTreeBytes),
        trees_mb: 0,
        commits_mb: 0,
        tags_mb: 0,
      },
      largestObjects,
      metricSource: 'git_cli',
      metricNotes: [
        'Repository object size and object count are measured with git count-objects -v.',
        'File sizes and largest objects describe tracked files materialized in the current checkout.',
        'Clone time remains an estimate; run the benchmark workflow for measured operation timing.',
      ],
      defaultBranch: branchResult.stdout.trim() || undefined,
      treeTruncated: false,
    };
  }

  private buildTestMetrics(simulated: Partial<ExtractedMetrics>): CollectionResult {
    const metrics: ExtractedMetrics = {
      repo_size_mb: simulated.repo_size_mb ?? 0,
      commit_count: simulated.commit_count ?? 0,
      file_count: simulated.file_count ?? 0,
      large_file_count: simulated.large_file_count ?? 0,
      branch_count: simulated.branch_count ?? 0,
      git_objects_count: simulated.git_objects_count ?? 0,
      largest_object_mb: simulated.largest_object_mb ?? 0,
      largest_object_path: simulated.largest_object_path ?? '',
      estimated_clone_min: simulated.estimated_clone_min ?? 0,
      current_tree_blob_mb: simulated.current_tree_blob_mb ?? 0,
    };

    return {
      metrics,
      objectDistribution: {
        blobs_mb: metrics.current_tree_blob_mb || 0,
        trees_mb: 0,
        commits_mb: 0,
        tags_mb: 0,
      },
      largestObjects: [],
      metricSource: 'simulated',
      metricNotes: ['Synthetic metrics supplied by an automated test.'],
      treeTruncated: false,
    };
  }

  private async persistMetrics(analysisId: string, metrics: ExtractedMetrics): Promise<MetricDTO[]> {
    const metricEntries: Array<{ type: string; value: number | undefined; unit: string }> = [
      { type: 'repo_size_mb', value: metrics.repo_size_mb, unit: 'MB' },
      { type: 'commit_count', value: metrics.commit_count, unit: 'count' },
      { type: 'file_count', value: metrics.file_count, unit: 'count' },
      { type: 'large_file_count', value: metrics.large_file_count, unit: 'count' },
      { type: 'branch_count', value: metrics.branch_count, unit: 'count' },
      { type: 'git_objects_count', value: metrics.git_objects_count, unit: 'count' },
      { type: 'largest_object_mb', value: metrics.largest_object_mb, unit: 'MB' },
      { type: 'estimated_clone_min', value: metrics.estimated_clone_min, unit: 'minutes' },
      { type: 'current_tree_blob_mb', value: metrics.current_tree_blob_mb, unit: 'MB' },
    ];

    const savedMetrics: MetricDTO[] = [];
    for (const metric of metricEntries) {
      if (metric.value === undefined || !Number.isFinite(metric.value)) continue;
      const saved = await db.createMetric({
        analysis_id: analysisId,
        metric_type: metric.type,
        metric_value: metric.value,
        unit: metric.unit,
      });
      savedMetrics.push(saved);
    }
    return savedMetrics;
  }

  private calculateOpportunityScore(metrics: ExtractedMetrics): number {
    let score = 10;

    if (metrics.repo_size_mb >= 500) score += 10;
    if (metrics.repo_size_mb >= 2_000) score += 10;
    if (metrics.repo_size_mb >= 10_000) score += 10;

    if (metrics.commit_count >= 5_000) score += 8;
    if (metrics.commit_count >= 25_000) score += 8;
    if (metrics.commit_count >= 100_000) score += 8;

    if (metrics.file_count >= 5_000) score += 8;
    if (metrics.file_count >= 20_000) score += 8;
    if (metrics.file_count >= 75_000) score += 8;

    if (metrics.large_file_count >= 10) score += 5;
    if (metrics.large_file_count >= 100) score += 7;

    return Math.min(100, score);
  }

  private parseCountObjects(output: string): Record<string, number> {
    const result: Record<string, number> = {
      count: 0,
      size: 0,
      'in-pack': 0,
      'size-pack': 0,
    };

    for (const line of output.split('\n')) {
      const [key, value] = line.trim().split(':').map((part) => part.trim());
      if (key && value !== undefined && key in result) {
        result[key] = Number.parseInt(value, 10) || 0;
      }
    }
    return result;
  }

  private estimateCloneMinutes(repoSizeMb: number): number {
    if (repoSizeMb <= 0) return 0;
    const effectiveTransferMbPerSecond = 20;
    return Math.round(Math.max(0.1, repoSizeMb / effectiveTransferMbPerSecond / 60) * 10) / 10;
  }

  private bytesToMb(bytes: number): number {
    return Math.round((bytes / 1024 / 1024) * 10) / 10;
  }
}

export const analysisService = new AnalysisService();
