import { ExtractedMetrics } from './metrics';

export type WorkloadSlug = 'local_dev' | 'ci_cd' | 'monorepo';

export type RecommendationCategory =
  | 'clone'
  | 'checkout'
  | 'maintenance'
  | 'filesystem';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type TemplateFormat = 'shell' | 'gitconfig';

export interface TemplateRecord {
  id: string;
  recommendation_id: string;
  title: string;
  content: string;
  format: TemplateFormat;
}

export interface RecommendationRecord {
  id: string;
  title: string;
  category: RecommendationCategory;
  severity: SeverityLevel;
  description: string;
  templates?: TemplateRecord[];
}

export interface RuleEvaluationContext {
  workloadSlug: WorkloadSlug;
  metrics: ExtractedMetrics;
  repositoryUrl: string;
  repositoryName: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  matched: boolean;
  title: string;
  category: RecommendationCategory;
  severity: SeverityLevel;
  relevanceScore: number;
  reasoning: string;
  description: string;
  templates: Array<{
    title: string;
    content: string;
    format: TemplateFormat;
  }>;
}

export interface RuleDefinition {
  id: string;
  workload: WorkloadSlug;
  title: string;
  category: RecommendationCategory;
  severity: SeverityLevel;
  evaluate: (ctx: RuleEvaluationContext) => {
    matched: boolean;
    relevanceScore: number;
    reasoning: string;
    customizedTemplates: Array<{
      title: string;
      content: string;
      format: TemplateFormat;
    }>;
  };
}
