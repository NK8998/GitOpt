import path from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import {
  ExtractedMetrics,
  LargestObjectInfo,
  ObjectDistribution,
} from '../../types/metrics';

interface GitHubRepositoryResponse {
  full_name: string;
  default_branch: string;
  size: number;
  archived: boolean;
}

interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

export interface CollectedRepositoryMetrics {
  metrics: ExtractedMetrics;
  objectDistribution: ObjectDistribution;
  largestObjects: LargestObjectInfo[];
  metricSource: 'github_api';
  metricNotes: string[];
  repositoryFullName: string;
  defaultBranch: string;
  treeTruncated: boolean;
}

interface GitHubLocation {
  owner: string;
  repo: string;
}

export class GitHubMetricsService {
  parseRepositoryUrl(rawUrl: string): GitHubLocation | null {
    const trimmed = rawUrl.trim();

    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/i, '') };
    }

    try {
      const url = new URL(trimmed);
      if (url.hostname.toLowerCase() !== 'github.com') return null;
      const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length < 2) return null;
      return {
        owner: parts[0],
        repo: parts[1].replace(/\.git$/i, ''),
      };
    } catch {
      return null;
    }
  }

  async collect(repositoryUrl: string): Promise<CollectedRepositoryMetrics> {
    const location = this.parseRepositoryUrl(repositoryUrl);
    if (!location) {
      throw new AppError(
        'Remote analysis currently supports GitHub repository URLs. Use a github.com/owner/repository URL or a local Git repository path.',
        400
      );
    }

    const { owner, repo } = location;
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);

    const { data: repository } = await this.requestJson<GitHubRepositoryResponse>(
      `/repos/${encodedOwner}/${encodedRepo}`
    );

    if (!repository.default_branch) {
      throw new AppError('The repository does not have a default branch to analyze.', 422);
    }

    const defaultBranch = repository.default_branch;
    const [commitCount, branchCount, tree] = await Promise.all([
      this.countCollection(
        `/repos/${encodedOwner}/${encodedRepo}/commits?sha=${encodeURIComponent(defaultBranch)}`,
        true
      ),
      this.countCollection(`/repos/${encodedOwner}/${encodedRepo}/branches`, true),
      this.fetchTree(encodedOwner, encodedRepo, defaultBranch),
    ]);

    const blobs = tree.tree.filter((entry) => entry.type === 'blob');
    const trees = tree.tree.filter((entry) => entry.type === 'tree');
    const largeFileThresholdBytes = 10 * 1024 * 1024;
    const totalCurrentTreeBlobBytes = blobs.reduce((sum, entry) => sum + (entry.size || 0), 0);
    const largeFileCount = blobs.filter((entry) => (entry.size || 0) >= largeFileThresholdBytes).length;
    const sortedBlobs = [...blobs]
      .filter((entry) => typeof entry.size === 'number')
      .sort((a, b) => (b.size || 0) - (a.size || 0));
    const largest = sortedBlobs[0];

    // GitHub reports repository size in KiB. This is the server-side repository
    // size reported by GitHub, not a measured clone payload.
    const repoSizeMb = Math.round((repository.size / 1024) * 10) / 10;
    const estimatedCloneMin = this.estimateCloneMinutes(repoSizeMb);

    const observedObjectCount = commitCount + blobs.length + trees.length;
    const metrics: ExtractedMetrics = {
      repo_size_mb: repoSizeMb,
      commit_count: commitCount,
      file_count: blobs.length,
      large_file_count: largeFileCount,
      branch_count: branchCount,
      git_objects_count: observedObjectCount,
      largest_object_mb: largest ? this.bytesToMb(largest.size || 0) : 0,
      largest_object_path: largest?.path || '',
      estimated_clone_min: estimatedCloneMin,
      current_tree_blob_mb: this.bytesToMb(totalCurrentTreeBlobBytes),
      repository_archived: repository.archived ? 1 : 0,
    };

    const largestObjects: LargestObjectInfo[] = sortedBlobs.slice(0, 10).map((entry) => ({
      name: path.posix.basename(entry.path),
      size_mb: this.bytesToMb(entry.size || 0),
      type: 'Blob',
      path: entry.path,
    }));

    const metricNotes = [
      'Repository size is the size reported by the GitHub Repository API and is not a measured network clone payload.',
      'File counts and largest objects come from the recursive tree of the default branch, so they describe the current tree rather than every historical blob.',
      'Observed Git object count combines current-tree entries with commit count; it is an evidence metric, not the output of git count-objects.',
      'Clone time is an estimate based on repository size and an assumed effective transfer rate of 20 MB/s; benchmark results should be used for measured timing.',
    ];

    if (tree.truncated) {
      metricNotes.push(
        'GitHub truncated the recursive tree response because the repository is very large; file and largest-object metrics are therefore lower bounds.'
      );
    }

    return {
      metrics,
      objectDistribution: {
        blobs_mb: this.bytesToMb(totalCurrentTreeBlobBytes),
        trees_mb: 0,
        commits_mb: 0,
        tags_mb: 0,
      },
      largestObjects,
      metricSource: 'github_api',
      metricNotes,
      repositoryFullName: repository.full_name,
      defaultBranch,
      treeTruncated: tree.truncated,
    };
  }

  private async fetchTree(
    owner: string,
    repo: string,
    defaultBranch: string
  ): Promise<GitHubTreeResponse> {
    try {
      const { data } = await this.requestJson<GitHubTreeResponse>(
        `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`
      );
      return data;
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409) {
        return { sha: '', tree: [], truncated: false };
      }
      throw error;
    }
  }

  private async countCollection(endpoint: string, allowEmpty = false): Promise<number> {
    const separator = endpoint.includes('?') ? '&' : '?';
    try {
      const { data, headers } = await this.requestJson<unknown[]>(`${endpoint}${separator}per_page=1`);
      const link = headers.get('link');
      const lastLink = link
        ?.split(',')
        .map((part) => part.trim())
        .find((part) => part.includes('rel="last"'));
      const lastUrl = lastLink?.match(/<([^>]+)>/)?.[1];
      if (lastUrl) {
        const page = Number(new URL(lastUrl).searchParams.get('page'));
        if (Number.isFinite(page) && page >= 0) return page;
      }
      return Array.isArray(data) ? data.length : 0;
    } catch (error) {
      if (allowEmpty && error instanceof AppError && error.statusCode === 409) {
        return 0;
      }
      throw error;
    }
  }

  private async requestJson<T>(endpoint: string): Promise<{ data: T; headers: Headers }> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'GitOpt/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }

    const response = await fetch(`https://api.github.com${endpoint}`, { headers });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { message?: string };
        detail = body.message || detail;
      } catch {
        // Keep the HTTP status text when GitHub does not return JSON.
      }

      if (response.status === 404) {
        throw new AppError(
          `GitHub repository or resource was not found. For private repositories, configure GITHUB_TOKEN with repository read access. (${detail})`,
          404
        );
      }

      if (response.status === 403 || response.status === 429) {
        throw new AppError(
          `GitHub API rate limit or access restriction encountered. Configure GITHUB_TOKEN to increase the rate limit. (${detail})`,
          response.status
        );
      }

      throw new AppError(`GitHub API request failed (${response.status}): ${detail}`, response.status);
    }

    return {
      data: (await response.json()) as T,
      headers: response.headers,
    };
  }

  private estimateCloneMinutes(repoSizeMb: number): number {
    if (repoSizeMb <= 0) return 0;
    const effectiveTransferMbPerSecond = 20;
    const minutes = repoSizeMb / effectiveTransferMbPerSecond / 60;
    return Math.round(Math.max(0.1, minutes) * 10) / 10;
  }

  private bytesToMb(bytes: number): number {
    return Math.round((bytes / 1024 / 1024) * 10) / 10;
  }
}

export const githubMetricsService = new GitHubMetricsService();
