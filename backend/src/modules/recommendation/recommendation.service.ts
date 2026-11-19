import { db } from '../../config/database';
import { rulesEngine } from './rules.engine';
import { ExtractedMetrics } from '../../types/metrics';
import { WorkloadSlug, RecommendationRecord, TemplateRecord, ImpactEstimate } from '../../types/rules';
import { AppError } from '../../middleware/errorHandler';

export interface EvaluatedRecommendationDTO {
  recommendation_id: string;
  title: string;
  category: string;
  severity: string;
  relevance_score: number;
  reasoning: string;
  description: string;
  why_recommended?: string;
  advantages?: string[];
  tradeoffs?: string[];
  git_mechanism?: string;
  impact_estimate?: ImpactEstimate;
  templates: TemplateRecord[];
}

export class RecommendationService {
  async evaluate(analysisId: string): Promise<EvaluatedRecommendationDTO[]> {
    await db.init();

    // 1. Fetch analysis record
    const analysis = await db.getAnalysisById(analysisId);
    if (!analysis) {
      throw new AppError(`Analysis with ID '${analysisId}' not found`, 404);
    }

    // 2. Fetch repository
    const repository = await db.getRepositoryById(analysis.repository_id);
    if (!repository) {
      throw new AppError(`Repository for analysis '${analysisId}' not found`, 404);
    }

    // 3. Fetch workload profile
    const workload = await db.findWorkloadById(repository.workload_id);
    if (!workload) {
      throw new AppError(`Workload profile '${repository.workload_id}' not found`, 404);
    }

    // 4. Collect extracted metrics
    const rawMetrics = await db.getMetricsByAnalysisId(analysisId);
    const metrics: ExtractedMetrics = {
      repo_size_mb: 0,
      commit_count: 0,
      file_count: 0,
      large_file_count: 0,
    };

    for (const m of rawMetrics) {
      metrics[m.metric_type] = Number(m.metric_value);
    }

    // 5. Execute deterministic rules engine
    const evaluationResults = rulesEngine.evaluate({
      workloadSlug: workload.slug as WorkloadSlug,
      metrics,
      repositoryUrl: repository.url_path,
      repositoryName: repository.name,
    });

    // 6. Clear existing recommendations for this analysis
    await db.clearAnalysisRecommendations(analysisId);

    // 7. Persist matched recommendations, templates, and junction table rows
    const persistedResults: EvaluatedRecommendationDTO[] = [];

    for (const res of evaluationResults) {
      // Find or create recommendation record
      const recommendation = await db.upsertRecommendation({
        title: res.title,
        category: res.category,
        severity: res.severity,
        description: res.description,
        why_recommended: res.why_recommended,
        advantages: res.advantages,
        tradeoffs: res.tradeoffs,
        git_mechanism: res.git_mechanism,
        impact_estimate: res.impact_estimate,
        templates: res.templates,
      });

      // Insert junction record into analysis_recommendations
      await db.saveAnalysisRecommendation({
        analysis_id: analysisId,
        recommendation_id: recommendation.id,
        relevance_score: res.relevanceScore,
        reasoning: res.reasoning,
      });

      persistedResults.push({
        recommendation_id: recommendation.id,
        title: recommendation.title,
        category: recommendation.category,
        severity: recommendation.severity,
        relevance_score: res.relevanceScore,
        reasoning: res.reasoning,
        description: recommendation.description,
        why_recommended: res.why_recommended,
        advantages: res.advantages,
        tradeoffs: res.tradeoffs,
        git_mechanism: res.git_mechanism,
        impact_estimate: res.impact_estimate,
        templates: recommendation.templates || [],
      });
    }

    return persistedResults;
  }

  async getByAnalysisId(analysisId: string): Promise<EvaluatedRecommendationDTO[]> {
    await db.init();

    // Verify analysis exists
    const analysis = await db.getAnalysisById(analysisId);
    if (!analysis) {
      throw new AppError(`Analysis with ID '${analysisId}' not found`, 404);
    }

    const junctionRows = await db.getRecommendationsForAnalysis(analysisId);

    // If no evaluations exist yet, automatically trigger evaluation
    if (junctionRows.length === 0) {
      return this.evaluate(analysisId);
    }

    return junctionRows.map((row) => ({
      recommendation_id: row.recommendation.id,
      title: row.recommendation.title,
      category: row.recommendation.category,
      severity: row.recommendation.severity,
      relevance_score: Number(row.relevance_score),
      reasoning: row.reasoning,
      description: row.recommendation.description,
      why_recommended: row.recommendation.why_recommended,
      advantages: row.recommendation.advantages,
      tradeoffs: row.recommendation.tradeoffs,
      git_mechanism: row.recommendation.git_mechanism,
      impact_estimate: row.recommendation.impact_estimate,
      templates: row.templates,
    }));
  }

  async getRecommendationById(id: string): Promise<RecommendationRecord> {
    await db.init();
    const rec = await db.getRecommendationById(id);
    if (!rec) {
      throw new AppError(`Recommendation with ID '${id}' not found`, 404);
    }
    return rec;
  }

  async getTemplatesByRecommendationId(recId: string): Promise<TemplateRecord[]> {
    await db.init();
    const rec = await db.getRecommendationById(recId);
    if (!rec) {
      throw new AppError(`Recommendation with ID '${recId}' not found`, 404);
    }
    return db.getTemplatesByRecommendationId(recId);
  }
}

export const recommendationService = new RecommendationService();
