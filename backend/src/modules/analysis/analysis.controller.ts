import { Request, Response, NextFunction } from 'express';
import { analysisService } from './analysis.service';

export class AnalysisController {
  async trigger(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await analysisService.triggerAnalysis({
        repository_id: req.body.repository_id,
        simulated_metrics: req.body.simulated_metrics,
      });

      res.status(201).json({
        status: 'success',
        message: 'Repository analysis completed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const analysis = await analysisService.getAnalysisById(req.params.id);
      res.status(200).json({
        status: 'success',
        data: analysis,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const analysisController = new AnalysisController();
