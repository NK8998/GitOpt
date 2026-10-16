import { Request, Response, NextFunction } from 'express';
import { recommendationService } from './recommendation.service';

export class RecommendationController {
  async evaluate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { analysisId } = req.params;
      const results = await recommendationService.evaluate(analysisId);

      res.status(200).json({
        status: 'success',
        message: 'Analysis evaluation completed',
        count: results.length,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByAnalysisId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { analysisId } = req.params;
      const results = await recommendationService.getByAnalysisId(analysisId);

      res.status(200).json({
        status: 'success',
        count: results.length,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const recommendationController = new RecommendationController();
