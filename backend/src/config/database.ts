import { Pool } from 'pg';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
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

// In-Memory Relational Database State with Foreign Key Cascades & Constraints
class RelationalDatabaseStore {
  users: Map<string, UserRecord> = new Map();
  workloadProfiles: Map<string, WorkloadProfileRecord> = new Map();
  repositories: Map<string, RepositoryRecord> = new Map();
  analyses: Map<string, AnalysisRecord> = new Map();
  metrics: Map<string, MetricRecord> = new Map();
  recommendations: Map<string, RecommendationRecord> = new Map();
  templates: Map<string, TemplateRecord> = new Map();
  benchmarks: Map<string, BenchmarkRecord> = new Map();
  analysisRecommendations: Map<string, AnalysisRecommendationRecord> = new Map(); // key: `${analysis_id}:${recommendation_id}`


  private isInitialized = false;

  async init() {
    if (this.isInitialized) return;

    // Seed Workload Profiles
    for (const wp of WORKLOAD_PROFILES_SEED) {
      this.workloadProfiles.set(wp.id, {
        id: wp.id,
        slug: wp.slug,
        name: wp.name,
        description: wp.description,
      });
    }

    // Seed Recommendations and Templates
    for (const rec of INITIAL_RECOMMENDATIONS_SEED) {
      this.recommendations.set(rec.id, {
        id: rec.id,
        title: rec.title,
        category: rec.category,
        severity: rec.severity,
        description: rec.description,
      });

      this.templates.set(rec.template.id, {
        id: rec.template.id,
        recommendation_id: rec.id,
        title: rec.template.title,
        content: rec.template.content,
        format: rec.template.format,
      });
    }

    // Seed default developer user
    const defaultUserId = '00000000-0000-4000-8000-000000000001';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Password123!', salt);
    this.users.set(defaultUserId, {
      id: defaultUserId,
      name: 'Senior Dev Engineer',
      email: 'developer@gitoptima.io',
      password_hash: passwordHash,
      role: 'developer',
      created_at: new Date().toISOString(),
    });

    // Seed a sample repository for local_dev and ci_cd
    const sampleRepoId = '99999999-9999-4999-8999-999999999999';
    const ciCdWorkloadId = '22222222-2222-4222-8222-222222222222';
    this.repositories.set(sampleRepoId, {
      id: sampleRepoId,
      user_id: defaultUserId,
      workload_id: ciCdWorkloadId,
      name: 'microservices-checkout-service',
      source: 'github',
      url_path: 'https://github.com/gitoptima/checkout-service.git',
      created_at: new Date().toISOString(),
    });

    this.isInitialized = true;
    console.log('✓ GitOptima Database initialized & seeded successfully.');
  }

  // --- Users Operations ---
  async createUser(data: Omit<UserRecord, 'id' | 'created_at'>): Promise<UserRecord> {
    // Unique email constraint
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === data.email.toLowerCase()) {
        throw new Error('User with this email already exists');
      }
    }
    const id = crypto.randomUUID();
    const record: UserRecord = {
      id,
      ...data,
      created_at: new Date().toISOString(),
    };
    this.users.set(id, record);
    return record;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) || null;
  }

  // --- Workload Profiles ---
  async getAllWorkloads(): Promise<WorkloadProfileRecord[]> {
    return Array.from(this.workloadProfiles.values());
  }

  async findWorkloadById(id: string): Promise<WorkloadProfileRecord | null> {
    return this.workloadProfiles.get(id) || null;
  }

  async findWorkloadBySlug(slug: string): Promise<WorkloadProfileRecord | null> {
    for (const wp of this.workloadProfiles.values()) {
      if (wp.slug === slug) return wp;
    }
    return null;
  }

  // --- Repositories Operations ---
  async createRepository(data: {
    user_id: string;
    workload_id: string;
    name: string;
    source: 'github' | 'gitlab' | 'local';
    url_path: string;
  }): Promise<RepositoryRecord> {
    // Foreign key validations
    if (!this.users.has(data.user_id)) {
      throw new Error(`Foreign key violation: user_id '${data.user_id}' not found`);
    }
    if (!this.workloadProfiles.has(data.workload_id)) {
      throw new Error(`Foreign key violation: workload_id '${data.workload_id}' not found`);
    }

    const id = crypto.randomUUID();
    const record: RepositoryRecord = {
      id,
      ...data,
      created_at: new Date().toISOString(),
    };
    this.repositories.set(id, record);
    return record;
  }

  async getRepositoriesByUserId(userId: string): Promise<RepositoryRecord[]> {
    const list: RepositoryRecord[] = [];
    for (const repo of this.repositories.values()) {
      if (repo.user_id === userId) {
        const wp = this.workloadProfiles.get(repo.workload_id);
        list.push({ ...repo, workload: wp });
      }
    }
    return list.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  }

  async getRepositoryById(id: string): Promise<RepositoryRecord | null> {
    const repo = this.repositories.get(id);
    if (!repo) return null;
    const wp = this.workloadProfiles.get(repo.workload_id);
    return { ...repo, workload: wp };
  }

  async deleteRepository(id: string): Promise<boolean> {
    if (!this.repositories.has(id)) return false;
    // CASCADE: Delete associated analyses
    const associatedAnalyses: string[] = [];
    for (const [analysisId, analysis] of this.analyses.entries()) {
      if (analysis.repository_id === id) {
        associatedAnalyses.push(analysisId);
      }
    }
    for (const aId of associatedAnalyses) {
      await this.deleteAnalysis(aId);
    }
    this.repositories.delete(id);
    return true;
  }

  // --- Analyses Operations ---
  async createAnalysis(data: {
    repository_id: string;
    status: AnalysisRecord['status'];
    duration_ms?: number | null;
    optimization_score?: number;
    current_stage?: string;
    progress_percent?: number;
    object_distribution?: AnalysisRecord['object_distribution'];
    largest_objects?: AnalysisRecord['largest_objects'];
  }): Promise<AnalysisRecord> {
    if (!this.repositories.has(data.repository_id)) {
      throw new Error(`Foreign key violation: repository_id '${data.repository_id}' not found`);
    }

    const id = crypto.randomUUID();
    const record: AnalysisRecord = {
      id,
      repository_id: data.repository_id,
      status: data.status,
      duration_ms: data.duration_ms ?? null,
      optimization_score: data.optimization_score ?? 72,
      current_stage: data.current_stage ?? 'discovery',
      progress_percent: data.progress_percent ?? 0,
      object_distribution: data.object_distribution,
      largest_objects: data.largest_objects,
      created_at: new Date().toISOString(),
    };
    this.analyses.set(id, record);
    return record;
  }

  async updateAnalysis(
    id: string,
    updates: Partial<AnalysisRecord>
  ): Promise<AnalysisRecord> {
    const existing = this.analyses.get(id);
    if (!existing) {
      throw new Error(`Analysis with id '${id}' not found`);
    }
    const updated: AnalysisRecord = {
      ...existing,
      ...updates,
    };
    this.analyses.set(id, updated);
    return updated;
  }

  async getAnalysisById(id: string): Promise<AnalysisRecord | null> {
    const analysis = this.analyses.get(id);
    if (!analysis) return null;

    const metricsList: MetricDTO[] = [];
    for (const m of this.metrics.values()) {
      if (m.analysis_id === id) {
        metricsList.push(m);
      }
    }

    const repo = await this.getRepositoryById(analysis.repository_id);

    return {
      ...analysis,
      metrics: metricsList,
      repository: repo || undefined,
    };
  }

  async getAllAnalyses(): Promise<AnalysisRecord[]> {
    const list: AnalysisRecord[] = [];
    for (const a of this.analyses.values()) {
      const full = await this.getAnalysisById(a.id);
      if (full) list.push(full);
    }
    return list.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  }

  async getAnalysesByRepositoryId(repoId: string): Promise<AnalysisRecord[]> {
    const list: AnalysisRecord[] = [];
    for (const a of this.analyses.values()) {
      if (a.repository_id === repoId) {
        const full = await this.getAnalysisById(a.id);
        if (full) list.push(full);
      }
    }
    return list.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  }

  async deleteAnalysis(id: string): Promise<boolean> {
    if (!this.analyses.has(id)) return false;
    // CASCADE metrics
    for (const [mId, m] of this.metrics.entries()) {
      if (m.analysis_id === id) {
        this.metrics.delete(mId);
      }
    }
    // CASCADE analysis_recommendations
    for (const [key, ar] of this.analysisRecommendations.entries()) {
      if (ar.analysis_id === id) {
        this.analysisRecommendations.delete(key);
      }
    }
    // CASCADE benchmarks
    for (const [bId, b] of this.benchmarks.entries()) {
      if (b.analysis_id === id) {
        this.benchmarks.delete(bId);
      }
    }
    this.analyses.delete(id);
    return true;
  }

  // --- Metrics Operations ---
  async createMetric(data: {
    analysis_id: string;
    metric_type: string;
    metric_value: number;
    unit: string;
  }): Promise<MetricRecord> {
    if (!this.analyses.has(data.analysis_id)) {
      throw new Error(`Foreign key violation: analysis_id '${data.analysis_id}' not found`);
    }
    const id = crypto.randomUUID();
    const record: MetricRecord = {
      id,
      ...data,
    };
    this.metrics.set(id, record);
    return record;
  }

  async getMetricsByAnalysisId(analysisId: string): Promise<MetricRecord[]> {
    const results: MetricRecord[] = [];
    for (const m of this.metrics.values()) {
      if (m.analysis_id === analysisId) {
        results.push(m);
      }
    }
    return results;
  }

  // --- Recommendations & Templates ---
  async getAllRecommendations(): Promise<RecommendationRecord[]> {
    const list: RecommendationRecord[] = [];
    for (const rec of this.recommendations.values()) {
      const recTemplates: TemplateRecord[] = [];
      for (const t of this.templates.values()) {
        if (t.recommendation_id === rec.id) {
          recTemplates.push(t);
        }
      }
      list.push({ ...rec, templates: recTemplates });
    }
    return list;
  }

  async findRecommendationByTitle(title: string): Promise<RecommendationRecord | null> {
    for (const rec of this.recommendations.values()) {
      if (rec.title.toLowerCase().includes(title.toLowerCase()) || title.toLowerCase().includes(rec.title.toLowerCase())) {
        const recTemplates: TemplateRecord[] = [];
        for (const t of this.templates.values()) {
          if (t.recommendation_id === rec.id) {
            recTemplates.push(t);
          }
        }
        return { ...rec, templates: recTemplates };
      }
    }
    return null;
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
    let rec = await this.findRecommendationByTitle(data.title);
    if (!rec) {
      const id = crypto.randomUUID();
      rec = {
        id,
        title: data.title,
        category: data.category,
        severity: data.severity,
        description: data.description,
        why_recommended: data.why_recommended,
        advantages: data.advantages,
        tradeoffs: data.tradeoffs,
        git_mechanism: data.git_mechanism,
        impact_estimate: data.impact_estimate,
        templates: [],
      };
      this.recommendations.set(id, rec);
    } else {
      rec.why_recommended = data.why_recommended || rec.why_recommended;
      rec.advantages = data.advantages || rec.advantages;
      rec.tradeoffs = data.tradeoffs || rec.tradeoffs;
      rec.git_mechanism = data.git_mechanism || rec.git_mechanism;
      rec.impact_estimate = data.impact_estimate || rec.impact_estimate;
    }

    const savedTemplates: TemplateRecord[] = [];
    for (const t of data.templates) {
      let existingTemplate: TemplateRecord | undefined;
      for (const cur of this.templates.values()) {
        if (cur.recommendation_id === rec.id && cur.title === t.title) {
          existingTemplate = cur;
          break;
        }
      }
      if (existingTemplate) {
        existingTemplate.content = t.content;
        existingTemplate.format = t.format;
        savedTemplates.push(existingTemplate);
      } else {
        const tId = crypto.randomUUID();
        const newTemplate: TemplateRecord = {
          id: tId,
          recommendation_id: rec.id,
          title: t.title,
          content: t.content,
          format: t.format,
        };
        this.templates.set(tId, newTemplate);
        savedTemplates.push(newTemplate);
      }
    }

    return {
      ...rec,
      templates: savedTemplates,
    };
  }

  // --- Junction Table: Analysis Recommendations ---
  async saveAnalysisRecommendation(data: {
    analysis_id: string;
    recommendation_id: string;
    relevance_score: number;
    reasoning: string;
  }): Promise<AnalysisRecommendationRecord> {
    if (!this.analyses.has(data.analysis_id)) {
      throw new Error(`Foreign key violation: analysis_id '${data.analysis_id}' not found`);
    }
    if (!this.recommendations.has(data.recommendation_id)) {
      throw new Error(`Foreign key violation: recommendation_id '${data.recommendation_id}' not found`);
    }

    const key = `${data.analysis_id}:${data.recommendation_id}`;
    const record: AnalysisRecommendationRecord = {
      analysis_id: data.analysis_id,
      recommendation_id: data.recommendation_id,
      relevance_score: data.relevance_score,
      reasoning: data.reasoning,
      created_at: new Date().toISOString(),
    };
    this.analysisRecommendations.set(key, record);
    return record;
  }

  async getRecommendationsForAnalysis(analysisId: string): Promise<
    Array<{
      recommendation: RecommendationRecord;
      relevance_score: number;
      reasoning: string;
      templates: TemplateRecord[];
    }>
  > {
    const results: Array<{
      recommendation: RecommendationRecord;
      relevance_score: number;
      reasoning: string;
      templates: TemplateRecord[];
    }> = [];

    for (const ar of this.analysisRecommendations.values()) {
      if (ar.analysis_id === analysisId) {
        const rec = this.recommendations.get(ar.recommendation_id);
        if (rec) {
          const templates: TemplateRecord[] = [];
          for (const t of this.templates.values()) {
            if (t.recommendation_id === rec.id) {
              templates.push(t);
            }
          }
          results.push({
            recommendation: rec,
            relevance_score: ar.relevance_score,
            reasoning: ar.reasoning,
            templates,
          });
        }
      }
    }

    return results.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  async clearAnalysisRecommendations(analysisId: string): Promise<void> {
    for (const [key, ar] of this.analysisRecommendations.entries()) {
      if (ar.analysis_id === analysisId) {
        this.analysisRecommendations.delete(key);
      }
    }
  }

  // --- Benchmarks Operations ---
  async createBenchmark(data: Omit<BenchmarkRecord, 'id' | 'created_at'>): Promise<BenchmarkRecord> {
    if (!this.analyses.has(data.analysis_id)) {
      throw new Error(`Foreign key violation: analysis_id '${data.analysis_id}' not found`);
    }

    const id = crypto.randomUUID();
    const record: BenchmarkRecord = {
      id,
      ...data,
      created_at: new Date().toISOString(),
    };
    this.benchmarks.set(id, record);
    return record;
  }

  async getBenchmarksByAnalysisId(analysisId: string): Promise<BenchmarkRecord[]> {
    const list: BenchmarkRecord[] = [];
    for (const b of this.benchmarks.values()) {
      if (b.analysis_id === analysisId) {
        list.push(b);
      }
    }
    return list;
  }

  async deleteBenchmarksByAnalysisId(analysisId: string): Promise<void> {
    for (const [id, b] of this.benchmarks.entries()) {
      if (b.analysis_id === analysisId) {
        this.benchmarks.delete(id);
      }
    }
  }

  // --- Recommendation & Template Lookups ---
  async getRecommendationById(id: string): Promise<RecommendationRecord | null> {
    const rec = this.recommendations.get(id);
    if (!rec) return null;
    const recTemplates: TemplateRecord[] = [];
    for (const t of this.templates.values()) {
      if (t.recommendation_id === rec.id) {
        recTemplates.push(t);
      }
    }
    return { ...rec, templates: recTemplates };
  }

  async getTemplatesByRecommendationId(recommendationId: string): Promise<TemplateRecord[]> {
    const list: TemplateRecord[] = [];
    for (const t of this.templates.values()) {
      if (t.recommendation_id === recommendationId) {
        list.push(t);
      }
    }
    return list;
  }

  // Diagnostic table stats
  getTableStats() {
    return {
      users: this.users.size,
      workload_profiles: this.workloadProfiles.size,
      repositories: this.repositories.size,
      analyses: this.analyses.size,
      metrics: this.metrics.size,
      recommendations: this.recommendations.size,
      templates: this.templates.size,
      benchmarks: this.benchmarks.size,
      analysis_recommendations: this.analysisRecommendations.size,
    };
  }
}

// Singleton database instance
export const db = new RelationalDatabaseStore();

// Optional PostgreSQL Pool connection (when DATABASE_URL is configured)
let pgPool: Pool | null = null;
if (env.DATABASE_URL) {
  try {
    pgPool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  } catch (err) {
    console.warn('PostgreSQL Pool initialization warning:', err);
  }
}

export { pgPool };
