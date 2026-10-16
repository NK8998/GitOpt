import bcrypt from 'bcryptjs';
import { Pool, QueryResultRow } from 'pg';
import { env } from './env';
import { WORKLOAD_PROFILES_SEED, INITIAL_RECOMMENDATIONS_SEED } from './constants';
import {
  MetricDTO,
  RepositoryRecord,
  AnalysisRecord,
  WorkloadProfileRecord,
} from '../types/metrics';
import { RecommendationRecord, TemplateRecord } from '../types/rules';
import { BenchmarkRecord } from '../types/benchmark';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export interface MetricRecord {
  id: string;
  analysis_id: string;
  metric_type: string;
  metric_value: number;
  unit: string;
}

export interface AnalysisRecommendationRecord {
  analysis_id: string;
  recommendation_id: string;
  relevance_score: number;
  reasoning: string;
  created_at?: string;
}

const poolConfig = env.DATABASE_URL
  ? {
      connectionString: env.DATABASE_URL,
      ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: env.PGHOST,
      port: env.PGPORT,
      user: env.PGUSER,
      password: env.PGPASSWORD || undefined,
      database: env.PGDATABASE,
      ssl: false,
    };

export const pgPool = new Pool({
  ...poolConfig,
  max: env.PGPOOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function number(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function mapWorkload(row: QueryResultRow): WorkloadProfileRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
  };
}

function mapRepository(row: QueryResultRow): RepositoryRecord {
  const repository: RepositoryRecord = {
    id: row.id,
    user_id: row.user_id,
    workload_id: row.workload_id,
    name: row.name,
    source: row.source,
    url_path: row.url_path,
    created_at: iso(row.created_at),
  };

  if (row.workload_slug) {
    repository.workload = {
      id: row.workload_id,
      slug: row.workload_slug,
      name: row.workload_name,
      description: row.workload_description,
    };
  }

  return repository;
}

function mapAnalysis(row: QueryResultRow): AnalysisRecord {
  return {
    id: row.id,
    repository_id: row.repository_id,
    status: row.status,
    duration_ms: row.duration_ms === null ? null : number(row.duration_ms),
    optimization_score:
      row.optimization_score === null || row.optimization_score === undefined
        ? undefined
        : number(row.optimization_score),
    current_stage: row.current_stage || undefined,
    progress_percent:
      row.progress_percent === null || row.progress_percent === undefined
        ? undefined
        : number(row.progress_percent),
    object_distribution: row.object_distribution || undefined,
    largest_objects: row.largest_objects || undefined,
    metric_source: row.metric_source || undefined,
    metric_notes: row.metric_notes || undefined,
    default_branch: row.default_branch || undefined,
    tree_truncated: Boolean(row.tree_truncated),
    error_message: row.error_message || undefined,
    created_at: iso(row.created_at),
  };
}

function mapMetric(row: QueryResultRow): MetricRecord {
  return {
    id: row.id,
    analysis_id: row.analysis_id,
    metric_type: row.metric_type,
    metric_value: number(row.metric_value),
    unit: row.unit,
  };
}

function mapTemplate(row: QueryResultRow): TemplateRecord {
  return {
    id: row.id,
    recommendation_id: row.recommendation_id,
    title: row.title,
    content: row.content,
    format: row.format,
  };
}

function mapRecommendation(row: QueryResultRow): RecommendationRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    severity: row.severity,
    description: row.description,
    why_recommended: row.why_recommended || undefined,
    advantages: row.advantages || undefined,
    tradeoffs: row.tradeoffs || undefined,
    git_mechanism: row.git_mechanism || undefined,
    impact_estimate: row.impact_estimate || undefined,
  };
}

function mapBenchmark(row: QueryResultRow): BenchmarkRecord {
  return {
    id: row.id,
    analysis_id: row.analysis_id,
    strategy: row.strategy,
    clone_time_sec: number(row.clone_time_sec),
    data_transferred_mb: number(row.data_transferred_mb),
    disk_usage_mb: number(row.disk_usage_mb),
    relative_percent: number(row.relative_percent),
    is_best: Boolean(row.is_best),
    created_at: iso(row.created_at),
  };
}

class PostgresDatabaseStore {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    await pgPool.query('SELECT 1');
    await this.seedReferenceData();
    this.initialized = true;
    console.log(`✓ GitOpt PostgreSQL connected at ${env.PGHOST}:${env.PGPORT}/${env.PGDATABASE}`);
  }

  private async seedReferenceData(): Promise<void> {
    for (const wp of WORKLOAD_PROFILES_SEED) {
      await pgPool.query(
        `INSERT INTO workload_profiles(id, slug, name, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description`,
        [wp.id, wp.slug, wp.name, wp.description]
      );
    }

    for (const rec of INITIAL_RECOMMENDATIONS_SEED) {
      const existing = await pgPool.query(
        'SELECT id FROM recommendations WHERE title = $1 ORDER BY id LIMIT 1',
        [rec.title]
      );
      const recommendationId = existing.rows[0]?.id || rec.id;

      if (existing.rowCount) {
        await pgPool.query(
          `UPDATE recommendations
           SET category = $2, severity = $3, description = $4
           WHERE id = $1`,
          [recommendationId, rec.category, rec.severity, rec.description]
        );
      } else {
        await pgPool.query(
          `INSERT INTO recommendations(id, title, category, severity, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [recommendationId, rec.title, rec.category, rec.severity, rec.description]
        );
      }

      const template = await pgPool.query(
        `SELECT id FROM templates
         WHERE recommendation_id = $1 AND title = $2
         LIMIT 1`,
        [recommendationId, rec.template.title]
      );
      if (template.rowCount) {
        await pgPool.query(
          `UPDATE templates SET content = $3, format = $4
           WHERE recommendation_id = $1 AND title = $2`,
          [recommendationId, rec.template.title, rec.template.content, rec.template.format]
        );
      } else {
        await pgPool.query(
          `INSERT INTO templates(id, recommendation_id, title, content, format)
           VALUES ($1, $2, $3, $4, $5)`,
          [rec.template.id, recommendationId, rec.template.title, rec.template.content, rec.template.format]
        );
      }
    }

    const defaultUserId = '00000000-0000-4000-8000-000000000001';
    const defaultEmail = 'developer@gitoptima.io';
    const existingUser = await this.findUserById(defaultUserId);
    if (!existingUser) {
      const passwordHash = await bcrypt.hash('Password123!', 10);
      await pgPool.query(
        `INSERT INTO users(id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
        [defaultUserId, 'Senior Dev Engineer', defaultEmail, passwordHash, 'developer']
      );
    }
  }

  async createUser(data: Omit<UserRecord, 'id' | 'created_at'>): Promise<UserRecord> {
    const result = await pgPool.query(
      `INSERT INTO users(name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.name, data.email, data.password_hash, data.role]
    );
    return { ...result.rows[0], created_at: iso(result.rows[0].created_at) };
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await pgPool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    if (!result.rowCount) return null;
    return { ...result.rows[0], created_at: iso(result.rows[0].created_at) };
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const result = await pgPool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    if (!result.rowCount) return null;
    return { ...result.rows[0], created_at: iso(result.rows[0].created_at) };
  }

  async getAllWorkloads(): Promise<WorkloadProfileRecord[]> {
    const result = await pgPool.query('SELECT * FROM workload_profiles ORDER BY name');
    return result.rows.map(mapWorkload);
  }

  async findWorkloadById(id: string): Promise<WorkloadProfileRecord | null> {
    const result = await pgPool.query('SELECT * FROM workload_profiles WHERE id = $1 LIMIT 1', [id]);
    return result.rowCount ? mapWorkload(result.rows[0]) : null;
  }

  async findWorkloadBySlug(slug: string): Promise<WorkloadProfileRecord | null> {
    const result = await pgPool.query('SELECT * FROM workload_profiles WHERE slug = $1 LIMIT 1', [slug]);
    return result.rowCount ? mapWorkload(result.rows[0]) : null;
  }

  async createRepository(data: {
    user_id: string;
    workload_id: string;
    name: string;
    source: 'github' | 'gitlab' | 'local';
    url_path: string;
  }): Promise<RepositoryRecord> {
    const result = await pgPool.query(
      `INSERT INTO repositories(user_id, workload_id, name, source, url_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.user_id, data.workload_id, data.name, data.source, data.url_path]
    );
    return mapRepository(result.rows[0]);
  }

  async getRepositoriesByUserId(userId: string): Promise<RepositoryRecord[]> {
    const result = await pgPool.query(
      `SELECT r.*, w.slug AS workload_slug, w.name AS workload_name,
              w.description AS workload_description
       FROM repositories r
       JOIN workload_profiles w ON w.id = r.workload_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return result.rows.map(mapRepository);
  }

  async getAllRepositories(): Promise<RepositoryRecord[]> {
    const result = await pgPool.query(
      `SELECT r.*, w.slug AS workload_slug, w.name AS workload_name,
              w.description AS workload_description
       FROM repositories r
       JOIN workload_profiles w ON w.id = r.workload_id
       ORDER BY r.created_at DESC`
    );
    return result.rows.map(mapRepository);
  }

  async getRepositoryById(id: string): Promise<RepositoryRecord | null> {
    const result = await pgPool.query(
      `SELECT r.*, w.slug AS workload_slug, w.name AS workload_name,
              w.description AS workload_description
       FROM repositories r
       JOIN workload_profiles w ON w.id = r.workload_id
       WHERE r.id = $1
       LIMIT 1`,
      [id]
    );
    return result.rowCount ? mapRepository(result.rows[0]) : null;
  }

  async deleteRepository(id: string): Promise<boolean> {
    const result = await pgPool.query('DELETE FROM repositories WHERE id = $1', [id]);
    return Boolean(result.rowCount);
  }

  async createAnalysis(data: {
    repository_id: string;
    status: AnalysisRecord['status'];
    duration_ms?: number | null;
    optimization_score?: number;
    current_stage?: string;
    progress_percent?: number;
    object_distribution?: AnalysisRecord['object_distribution'];
    largest_objects?: AnalysisRecord['largest_objects'];
    metric_source?: AnalysisRecord['metric_source'];
    metric_notes?: string[];
    default_branch?: string;
    tree_truncated?: boolean;
    error_message?: string;
  }): Promise<AnalysisRecord> {
    const result = await pgPool.query(
      `INSERT INTO analyses(
         repository_id, status, duration_ms, optimization_score, current_stage,
         progress_percent, object_distribution, largest_objects, metric_source,
         metric_notes, default_branch, tree_truncated, error_message
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        data.repository_id,
        data.status,
        data.duration_ms ?? null,
        data.optimization_score ?? null,
        data.current_stage ?? 'discovery',
        data.progress_percent ?? 0,
        data.object_distribution ? JSON.stringify(data.object_distribution) : null,
        data.largest_objects ? JSON.stringify(data.largest_objects) : null,
        data.metric_source ?? null,
        data.metric_notes ?? null,
        data.default_branch ?? null,
        data.tree_truncated ?? false,
        data.error_message ?? null,
      ]
    );
    return mapAnalysis(result.rows[0]);
  }

  async updateAnalysis(id: string, updates: Partial<AnalysisRecord>): Promise<AnalysisRecord> {
    const allowed: Array<keyof AnalysisRecord> = [
      'status',
      'duration_ms',
      'optimization_score',
      'current_stage',
      'progress_percent',
      'object_distribution',
      'largest_objects',
      'metric_source',
      'metric_notes',
      'default_branch',
      'tree_truncated',
      'error_message',
    ];

    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (!(key in updates)) continue;
      let value = updates[key];
      if ((key === 'object_distribution' || key === 'largest_objects') && value !== undefined) {
        value = value === null ? null : JSON.stringify(value);
      }
      values.push(value === undefined ? null : value);
      assignments.push(`${key} = $${values.length}`);
    }

    if (!assignments.length) {
      const current = await this.getAnalysisById(id);
      if (!current) throw new Error(`Analysis with id '${id}' not found`);
      return current;
    }

    values.push(id);
    const result = await pgPool.query(
      `UPDATE analyses SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rowCount) throw new Error(`Analysis with id '${id}' not found`);
    return mapAnalysis(result.rows[0]);
  }

  async getAnalysisById(id: string): Promise<AnalysisRecord | null> {
    const analysisResult = await pgPool.query('SELECT * FROM analyses WHERE id = $1 LIMIT 1', [id]);
    if (!analysisResult.rowCount) return null;

    const analysis = mapAnalysis(analysisResult.rows[0]);
    const [metrics, repository] = await Promise.all([
      this.getMetricsByAnalysisId(id),
      this.getRepositoryById(analysis.repository_id),
    ]);

    return {
      ...analysis,
      metrics,
      repository: repository || undefined,
    };
  }

  async getAllAnalyses(): Promise<AnalysisRecord[]> {
    const result = await pgPool.query('SELECT id FROM analyses ORDER BY created_at DESC');
    const analyses = await Promise.all(result.rows.map((row) => this.getAnalysisById(row.id)));
    return analyses.filter((item): item is AnalysisRecord => Boolean(item));
  }

  async getAnalysesByRepositoryId(repoId: string): Promise<AnalysisRecord[]> {
    const result = await pgPool.query(
      'SELECT id FROM analyses WHERE repository_id = $1 ORDER BY created_at DESC',
      [repoId]
    );
    const analyses = await Promise.all(result.rows.map((row) => this.getAnalysisById(row.id)));
    return analyses.filter((item): item is AnalysisRecord => Boolean(item));
  }

  async deleteAnalysis(id: string): Promise<boolean> {
    const result = await pgPool.query('DELETE FROM analyses WHERE id = $1', [id]);
    return Boolean(result.rowCount);
  }

  async createMetric(data: {
    analysis_id: string;
    metric_type: string;
    metric_value: number;
    unit: string;
  }): Promise<MetricRecord> {
    const result = await pgPool.query(
      `INSERT INTO metrics(analysis_id, metric_type, metric_value, unit)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.analysis_id, data.metric_type, data.metric_value, data.unit]
    );
    return mapMetric(result.rows[0]);
  }

  async getMetricsByAnalysisId(analysisId: string): Promise<MetricRecord[]> {
    const result = await pgPool.query(
      'SELECT * FROM metrics WHERE analysis_id = $1 ORDER BY metric_type',
      [analysisId]
    );
    return result.rows.map(mapMetric);
  }

  async getAllRecommendations(): Promise<RecommendationRecord[]> {
    const result = await pgPool.query('SELECT * FROM recommendations ORDER BY title');
    return Promise.all(
      result.rows.map(async (row) => ({
        ...mapRecommendation(row),
        templates: await this.getTemplatesByRecommendationId(row.id),
      }))
    );
  }

  async findRecommendationByTitle(title: string): Promise<RecommendationRecord | null> {
    const result = await pgPool.query(
      `SELECT * FROM recommendations
       WHERE LOWER(title) = LOWER($1)
       ORDER BY id
       LIMIT 1`,
      [title]
    );
    if (!result.rowCount) return null;
    const recommendation = mapRecommendation(result.rows[0]);
    recommendation.templates = await this.getTemplatesByRecommendationId(recommendation.id);
    return recommendation;
  }

  async upsertRecommendation(data: {
    title: string;
    category: RecommendationRecord['category'];
    severity: RecommendationRecord['severity'];
    description: string;
    why_recommended?: string;
    advantages?: string[];
    tradeoffs?: string[];
    git_mechanism?: string;
    impact_estimate?: RecommendationRecord['impact_estimate'];
    templates: Array<{
      title: string;
      content: string;
      format: 'shell' | 'gitconfig';
    }>;
  }): Promise<RecommendationRecord> {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      let recommendation = await client.query(
        'SELECT * FROM recommendations WHERE LOWER(title) = LOWER($1) ORDER BY id LIMIT 1',
        [data.title]
      );

      if (recommendation.rowCount) {
        recommendation = await client.query(
          `UPDATE recommendations SET
             category = $2,
             severity = $3,
             description = $4,
             why_recommended = $5,
             advantages = $6,
             tradeoffs = $7,
             git_mechanism = $8,
             impact_estimate = $9
           WHERE id = $1
           RETURNING *`,
          [
            recommendation.rows[0].id,
            data.category,
            data.severity,
            data.description,
            data.why_recommended ?? null,
            data.advantages ?? null,
            data.tradeoffs ?? null,
            data.git_mechanism ?? null,
            data.impact_estimate ? JSON.stringify(data.impact_estimate) : null,
          ]
        );
      } else {
        recommendation = await client.query(
          `INSERT INTO recommendations(
             title, category, severity, description, why_recommended,
             advantages, tradeoffs, git_mechanism, impact_estimate
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [
            data.title,
            data.category,
            data.severity,
            data.description,
            data.why_recommended ?? null,
            data.advantages ?? null,
            data.tradeoffs ?? null,
            data.git_mechanism ?? null,
            data.impact_estimate ? JSON.stringify(data.impact_estimate) : null,
          ]
        );
      }

      const recommendationId = recommendation.rows[0].id;
      const savedTemplates: TemplateRecord[] = [];
      for (const template of data.templates) {
        const existing = await client.query(
          `SELECT id FROM templates
           WHERE recommendation_id = $1 AND title = $2
           LIMIT 1`,
          [recommendationId, template.title]
        );
        const result = existing.rowCount
          ? await client.query(
              `UPDATE templates SET content = $3, format = $4
               WHERE recommendation_id = $1 AND title = $2
               RETURNING *`,
              [recommendationId, template.title, template.content, template.format]
            )
          : await client.query(
              `INSERT INTO templates(recommendation_id, title, content, format)
               VALUES ($1,$2,$3,$4)
               RETURNING *`,
              [recommendationId, template.title, template.content, template.format]
            );
        savedTemplates.push(mapTemplate(result.rows[0]));
      }

      await client.query('COMMIT');
      return {
        ...mapRecommendation(recommendation.rows[0]),
        templates: savedTemplates,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async saveAnalysisRecommendation(data: {
    analysis_id: string;
    recommendation_id: string;
    relevance_score: number;
    reasoning: string;
  }): Promise<AnalysisRecommendationRecord> {
    const result = await pgPool.query(
      `INSERT INTO analysis_recommendations(
         analysis_id, recommendation_id, relevance_score, reasoning
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (analysis_id, recommendation_id)
       DO UPDATE SET relevance_score = EXCLUDED.relevance_score, reasoning = EXCLUDED.reasoning
       RETURNING *`,
      [data.analysis_id, data.recommendation_id, data.relevance_score, data.reasoning]
    );
    return {
      ...result.rows[0],
      relevance_score: number(result.rows[0].relevance_score),
      created_at: iso(result.rows[0].created_at),
    };
  }

  async getRecommendationsForAnalysis(analysisId: string): Promise<
    Array<{
      recommendation: RecommendationRecord;
      relevance_score: number;
      reasoning: string;
      templates: TemplateRecord[];
    }>
  > {
    const result = await pgPool.query(
      `SELECT ar.relevance_score, ar.reasoning,
              r.*
       FROM analysis_recommendations ar
       JOIN recommendations r ON r.id = ar.recommendation_id
       WHERE ar.analysis_id = $1
       ORDER BY ar.relevance_score DESC`,
      [analysisId]
    );

    return Promise.all(
      result.rows.map(async (row) => ({
        recommendation: mapRecommendation(row),
        relevance_score: number(row.relevance_score),
        reasoning: row.reasoning,
        templates: await this.getTemplatesByRecommendationId(row.id),
      }))
    );
  }

  async clearAnalysisRecommendations(analysisId: string): Promise<void> {
    await pgPool.query('DELETE FROM analysis_recommendations WHERE analysis_id = $1', [analysisId]);
  }

  async createBenchmark(data: Omit<BenchmarkRecord, 'id' | 'created_at'>): Promise<BenchmarkRecord> {
    const result = await pgPool.query(
      `INSERT INTO benchmarks(
         analysis_id, strategy, clone_time_sec, data_transferred_mb,
         disk_usage_mb, relative_percent, is_best
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        data.analysis_id,
        data.strategy,
        data.clone_time_sec,
        data.data_transferred_mb,
        data.disk_usage_mb,
        data.relative_percent,
        data.is_best,
      ]
    );
    return mapBenchmark(result.rows[0]);
  }

  async getBenchmarksByAnalysisId(analysisId: string): Promise<BenchmarkRecord[]> {
    const result = await pgPool.query(
      'SELECT * FROM benchmarks WHERE analysis_id = $1 ORDER BY created_at, strategy',
      [analysisId]
    );
    return result.rows.map(mapBenchmark);
  }

  async deleteBenchmarksByAnalysisId(analysisId: string): Promise<void> {
    await pgPool.query('DELETE FROM benchmarks WHERE analysis_id = $1', [analysisId]);
  }

  async getRecommendationById(id: string): Promise<RecommendationRecord | null> {
    const result = await pgPool.query('SELECT * FROM recommendations WHERE id = $1 LIMIT 1', [id]);
    if (!result.rowCount) return null;
    const recommendation = mapRecommendation(result.rows[0]);
    recommendation.templates = await this.getTemplatesByRecommendationId(id);
    return recommendation;
  }

  async getTemplatesByRecommendationId(recommendationId: string): Promise<TemplateRecord[]> {
    const result = await pgPool.query(
      'SELECT * FROM templates WHERE recommendation_id = $1 ORDER BY title',
      [recommendationId]
    );
    return result.rows.map(mapTemplate);
  }

  async getTableStats(): Promise<Record<string, number>> {
    const tables = [
      'users',
      'workload_profiles',
      'repositories',
      'analyses',
      'metrics',
      'recommendations',
      'templates',
      'benchmarks',
      'analysis_recommendations',
    ];

    const entries = await Promise.all(
      tables.map(async (table) => {
        const result = await pgPool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
        return [table, number(result.rows[0].count)] as const;
      })
    );
    return Object.fromEntries(entries);
  }
}

export const db = new PostgresDatabaseStore();
