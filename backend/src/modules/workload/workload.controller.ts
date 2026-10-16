import { Request, Response, NextFunction } from 'express';
import { workloadService } from './workload.service';

export class WorkloadController {
  async getWorkloads(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workloads = await workloadService.getAllWorkloads();
      res.status(200).json({
        status: 'success',
        count: workloads.length,
        data: workloads,
      });
    } catch (error) {
      next(error);
    }
  }

  async getWorkloadById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workload = await workloadService.getWorkloadById(req.params.id);
      res.status(200).json({
        status: 'success',
        data: workload,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const workloadController = new WorkloadController();
