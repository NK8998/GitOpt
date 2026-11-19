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
      const analysisId = req.params.analysisId || req.params.analysis_id || req.params.id;
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

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await recommendationService.getRecommendationById(id);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const templates = await recommendationService.getTemplatesByRecommendationId(id);

      res.status(200).json({
        status: 'success',
        count: templates.length,
        data: templates,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const recommendationController = new RecommendationController();
