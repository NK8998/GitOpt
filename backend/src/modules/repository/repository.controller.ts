import { Request, Response, NextFunction } from 'express';
import { repositoryService } from './repository.service';

export class RepositoryController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || req.body.user_id || '00000000-0000-4000-8000-000000000001';
      const repository = await repositoryService.registerRepository({
        userId,
        workload_id: req.body.workload_id,
        name: req.body.name,
        source: req.body.source || 'github',
        url_path: req.body.url_path,
      });

      res.status(201).json({
        status: 'success',
        message: 'Repository registered successfully',
        data: repository,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyRepositories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id || (req.query.userId as string);
      let repositories;
      if (userId) {
        repositories = await repositoryService.getUserRepositories(userId);
      } else {
        repositories = await repositoryService.getAllRepositories();
      }

      res.status(200).json({
        status: 'success',
        count: repositories.length,
        data: repositories,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRepositoryById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const details = await repositoryService.getRepositoryDetails(req.params.id);
      res.status(200).json({
        status: 'success',
        data: details,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteRepository(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await repositoryService.deleteRepository(req.params.id);
      res.status(200).json({
        status: 'success',
        message: 'Repository and associated analyses deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const repositoryController = new RepositoryController();
