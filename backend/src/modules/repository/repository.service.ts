import { db } from '../../config/database';
import { RepositoryRecord, AnalysisRecord } from '../../types/metrics';
import { AppError } from '../../middleware/errorHandler';

export interface CreateRepositoryInput {
  userId: string;
  workload_id: string;
  name: string;
  source: 'github' | 'gitlab' | 'local';
  url_path: string;
}

export class RepositoryService {
  async registerRepository(input: CreateRepositoryInput): Promise<RepositoryRecord> {
    await db.init();

    // Verify workload profile exists
    const workload = await db.findWorkloadById(input.workload_id);
    if (!workload) {
      throw new AppError(`Workload profile with ID '${input.workload_id}' does not exist`, 404);
    }

    // Check user exists, fallback to default seed user if needed
    let user = await db.findUserById(input.userId);
    if (!user) {
      // Fallback to default user
      const defaultUserId = '00000000-0000-4000-8000-000000000001';
      user = await db.findUserById(defaultUserId);
      if (!user) {
        throw new AppError(`User with ID '${input.userId}' not found`, 404);
      }
      input.userId = defaultUserId;
    }

    const created = await db.createRepository({
      user_id: input.userId,
      workload_id: input.workload_id,
      name: input.name,
      source: input.source,
      url_path: input.url_path,
    });

    return {
      ...created,
      workload,
    };
  }

  async getUserRepositories(userId: string): Promise<RepositoryRecord[]> {
    await db.init();
    return db.getRepositoriesByUserId(userId);
  }

  async getAllRepositories(): Promise<RepositoryRecord[]> {
    await db.init();
    const repos = Array.from(db.repositories.values());
    return repos.map((r) => ({
      ...r,
      workload: db.workloadProfiles.get(r.workload_id),
    }));
  }

  async getRepositoryDetails(
    id: string
  ): Promise<RepositoryRecord & { analyses: AnalysisRecord[] }> {
    await db.init();
    const repository = await db.getRepositoryById(id);
    if (!repository) {
      throw new AppError(`Repository with ID '${id}' not found`, 404);
    }

    const pastAnalyses = await db.getAnalysesByRepositoryId(id);

    return {
      ...repository,
      analyses: pastAnalyses,
    };
  }

  async deleteRepository(id: string): Promise<boolean> {
    await db.init();
    const success = await db.deleteRepository(id);
    if (!success) {
      throw new AppError(`Repository with ID '${id}' not found`, 404);
    }
    return true;
  }
}

export const repositoryService = new RepositoryService();
