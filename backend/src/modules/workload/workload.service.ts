import { db } from '../../config/database';
import { WorkloadProfileRecord } from '../../types/metrics';
import { AppError } from '../../middleware/errorHandler';

export class WorkloadService {
  async getAllWorkloads(): Promise<WorkloadProfileRecord[]> {
    await db.init();
    return db.getAllWorkloads();
  }

  async getWorkloadById(id: string): Promise<WorkloadProfileRecord> {
    await db.init();
    const wp = await db.findWorkloadById(id);
    if (!wp) {
      throw new AppError(`Workload profile with ID '${id}' not found`, 404);
    }
    return wp;
  }

  async getWorkloadBySlug(slug: string): Promise<WorkloadProfileRecord> {
    await db.init();
    const wp = await db.findWorkloadBySlug(slug);
    if (!wp) {
      throw new AppError(`Workload profile with slug '${slug}' not found`, 404);
    }
    return wp;
  }
}

export const workloadService = new WorkloadService();
