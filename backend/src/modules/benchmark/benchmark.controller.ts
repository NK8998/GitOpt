import { Request, Response, NextFunction } from 'express';
import { benchmarkService } from './benchmark.service';

export class BenchmarkController {
  async runBenchmark(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const analysisId = req.body.analysis_id || req.body.analysisId;
      if (!analysisId) {
        res.status(400).json({ status: 'error', message: 'analysis_id is required' });
        return;
      }

      const results = await benchmarkService.generateBenchmarks(analysisId);

      res.status(201).json({
        status: 'success',
        message: 'Benchmarks evaluated successfully',
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByAnalysisId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const analysisId = req.params.analysis_id || req.params.analysisId || req.params.id;
      const results = await benchmarkService.getBenchmarksByAnalysisId(analysisId);

      res.status(200).json({
        status: 'success',
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const benchmarkController = new BenchmarkController();
