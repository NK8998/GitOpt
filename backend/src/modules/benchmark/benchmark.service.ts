import { db } from '../../config/database';
import { BenchmarkComparisonDTO, BenchmarkStrategyDTO } from '../../types/benchmark';
import { AppError } from '../../middleware/errorHandler';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatSizeMb(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

const METHODOLOGY =
  'Modelled strategy comparison derived from repository size and the analysis clone-time estimate. These values are not measured Git operation timings.';

export class BenchmarkService {
  async generateBenchmarks(analysisId: string): Promise<BenchmarkComparisonDTO> {
    await db.init();

    const analysis = await db.getAnalysisById(analysisId);
    if (!analysis) {
      throw new AppError(`Analysis with ID '${analysisId}' not found`, 404);
    }

    const metricsMap: Record<string, number> = {};
    if (analysis.metrics) {
      for (const m of analysis.metrics) {
        metricsMap[m.metric_type] = Number(m.metric_value);
      }
    }

    const repoSizeMb = metricsMap.repo_size_mb;
    if (!Number.isFinite(repoSizeMb) || repoSizeMb < 0) {
      throw new AppError('Repository size is required before benchmark estimates can be generated.', 422);
    }

    const estimatedCloneMinutes = metricsMap.estimated_clone_min;
    const baseDurationSec = Number.isFinite(estimatedCloneMinutes)
      ? Math.max(1, Math.round(estimatedCloneMinutes * 60))
      : Math.max(1, Math.round((repoSizeMb / 20)));

    await db.deleteBenchmarksByAnalysisId(analysisId);

    const strategyConfigs = [
      {
        strategy: 'Full clone',
        timeSec: baseDurationSec,
        transferMb: repoSizeMb,
        diskMb: repoSizeMb * 1.05,
        relativePercent: 100,
        isBest: false,
      },
      {
        strategy: 'Shallow clone',
        timeSec: Math.max(1, Math.round(baseDurationSec * 0.43)),
        transferMb: repoSizeMb * 0.44,
        diskMb: repoSizeMb * 0.45,
        relativePercent: 43,
        isBest: false,
      },
      {
        strategy: 'Partial clone',
        timeSec: Math.max(1, Math.round(baseDurationSec * 0.30)),
        transferMb: repoSizeMb * 0.21,
        diskMb: repoSizeMb * 0.27,
        relativePercent: 30,
        isBest: false,
      },
      {
        strategy: 'Partial + sparse',
        timeSec: Math.max(1, Math.round(baseDurationSec * 0.24)),
        transferMb: repoSizeMb * 0.16,
        diskMb: repoSizeMb * 0.20,
        relativePercent: 24,
        isBest: true,
      },
    ];

    const strategies: BenchmarkStrategyDTO[] = [];
    for (const conf of strategyConfigs) {
      await db.createBenchmark({
        analysis_id: analysisId,
        strategy: conf.strategy,
        clone_time_sec: conf.timeSec,
        data_transferred_mb: conf.transferMb,
        disk_usage_mb: conf.diskMb,
        relative_percent: conf.relativePercent,
        is_best: conf.isBest,
      });

      strategies.push({
        strategy: conf.strategy,
        time: formatDuration(conf.timeSec),
        transfer: formatSizeMb(conf.transferMb),
        disk: formatSizeMb(conf.diskMb),
        relative_percent: conf.relativePercent,
        is_best: conf.isBest,
      });
    }

    const timeSavedSec = baseDurationSec - Math.round(baseDurationSec * 0.24);

    return {
      analysis_id: analysisId,
      best_strategy: 'Partial clone + sparse checkout',
      estimated_time_saved: formatDuration(timeSavedSec),
      percent_faster: 76,
      is_estimated: true,
      methodology: METHODOLOGY,
      strategies,
      chart_series: {
        clone_time_min: strategyConfigs.map((c) => +(c.timeSec / 60).toFixed(1)),
        data_transferred_gb: strategyConfigs.map((c) => +(c.transferMb / 1024).toFixed(1)),
        disk_usage_gb: strategyConfigs.map((c) => +(c.diskMb / 1024).toFixed(1)),
        labels: ['Full', 'Shallow', 'Partial', 'P + S'],
      },
    };
  }

  async getBenchmarksByAnalysisId(analysisId: string): Promise<BenchmarkComparisonDTO> {
    await db.init();

    const analysis = await db.getAnalysisById(analysisId);
    if (!analysis) {
      throw new AppError(`Analysis with ID '${analysisId}' not found`, 404);
    }

    const rows = await db.getBenchmarksByAnalysisId(analysisId);
    if (rows.length === 0) {
      return this.generateBenchmarks(analysisId);
    }

    const strategies: BenchmarkStrategyDTO[] = rows.map((r) => ({
      strategy: r.strategy,
      time: formatDuration(r.clone_time_sec),
      transfer: formatSizeMb(r.data_transferred_mb),
      disk: formatSizeMb(r.disk_usage_mb),
      relative_percent: r.relative_percent,
      is_best: r.is_best,
    }));

    const fullClone = rows.find((r) => r.strategy === 'Full clone') || rows[0];
    const bestClone = rows.find((r) => r.is_best) || rows[rows.length - 1];
    const timeSavedSec = Math.max(0, fullClone.clone_time_sec - bestClone.clone_time_sec);

    return {
      analysis_id: analysisId,
      best_strategy: bestClone.strategy,
      estimated_time_saved: formatDuration(timeSavedSec),
      percent_faster: Math.max(0, Math.round((1 - bestClone.relative_percent / 100) * 100)),
      is_estimated: true,
      methodology: METHODOLOGY,
      strategies,
      chart_series: {
        clone_time_min: rows.map((c) => +(c.clone_time_sec / 60).toFixed(1)),
        data_transferred_gb: rows.map((c) => +(c.data_transferred_mb / 1024).toFixed(1)),
        disk_usage_gb: rows.map((c) => +(c.disk_usage_mb / 1024).toFixed(1)),
        labels: rows.map((c) => {
          if (c.strategy.includes('Full')) return 'Full';
          if (c.strategy.includes('Shallow')) return 'Shallow';
          if (c.strategy.includes('sparse')) return 'P + S';
          return 'Partial';
        }),
      },
    };
  }
}

export const benchmarkService = new BenchmarkService();
