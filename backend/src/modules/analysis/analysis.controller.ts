import { Request, Response, NextFunction } from 'express';
import { analysisService } from './analysis.service';
import { recommendationService } from '../recommendation/recommendation.service';
import { benchmarkService } from '../benchmark/benchmark.service';

export class AnalysisController {
  async trigger(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { repository_id, simulated_metrics, advanced_options } = req.body;
      const analysis = await analysisService.triggerAnalysis({
        repository_id,
        simulated_metrics,
        advanced_options,
      });

      res.status(201).json({
        status: 'success',
        message: 'Analysis initiated successfully',
        data: analysis,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const analysis = await analysisService.getAnalysisById(id);

      res.status(200).json({
        status: 'success',
        data: analysis,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const analyses = await analysisService.getAllAnalyses();

      res.status(200).json({
        status: 'success',
        count: analyses.length,
        data: analyses,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const recommendations = await recommendationService.getByAnalysisId(id);

      res.status(200).json({
        status: 'success',
        count: recommendations.length,
        data: recommendations,
      });
    } catch (error) {
      next(error);
    }
  }

  async getBenchmarks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const benchmarks = await benchmarkService.getBenchmarksByAnalysisId(id);

      res.status(200).json({
        status: 'success',
        data: benchmarks,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const analysisController = new AnalysisController();
