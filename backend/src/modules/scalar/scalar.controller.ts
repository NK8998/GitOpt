import { NextFunction, Request, Response } from 'express';
import { scalarCapabilitiesService } from './scalar.capabilities';
import { scalarService } from './scalar.service';

function actorUserId(req: Request): string | undefined {
  return req.user?.id;
}

export class ScalarController {
  async getCapabilities(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const capabilities = await scalarCapabilitiesService.detect();
      res.status(200).json({ status: 'success', data: capabilities });
    } catch (error) {
      next(error);
    }
  }

  async createEnlistment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const enlistment = await scalarService.createEnlistment({
        repository_id: req.body.repository_id,
        actor_user_id: actorUserId(req),
      });
      res.status(202).json({
        status: 'success',
        message: 'Scalar clone scheduled',
        data: enlistment,
      });
    } catch (error) {
      next(error);
    }
  }

  async getEnlistment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const enlistment = await scalarService.getEnlistment(
        req.params.id,
        actorUserId(req)
      );
      res.status(200).json({ status: 'success', data: enlistment });
    } catch (error) {
      next(error);
    }
  }

  async getRepositoryEnlistments(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const enlistments = await scalarService.getRepositoryEnlistments(
        req.params.repositoryId,
        actorUserId(req)
      );
      res.status(200).json({ status: 'success', data: enlistments });
    } catch (error) {
      next(error);
    }
  }

  async startMaintenance(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const operation = await scalarService.startMaintenance(
        req.params.id,
        actorUserId(req)
      );
      res.status(202).json({
        status: 'success',
        message: 'Background maintenance scheduling started',
        data: operation,
      });
    } catch (error) {
      next(error);
    }
  }

  async optimizeMidx(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const operation = await scalarService.optimizeMidx(
        req.params.id,
        actorUserId(req)
      );
      res.status(202).json({
        status: 'success',
        message: 'MIDX optimization started',
        data: operation,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const scalarController = new ScalarController();
