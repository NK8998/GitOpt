import path from 'node:path';
import { env } from '../../config/env';

export function validateScalarRepositoryUrl(value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Scalar managed cloning currently supports HTTPS GitHub repository URLs only');
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('Repository URL must include owner and repository name');
  }
  return parsed;
}

export function workspaceRoot(): string {
  return path.resolve(process.cwd(), env.SCALAR_WORKSPACE_ROOT);
}

export function buildManagedWorkspacePath(
  repositoryId: string,
  enlistmentId: string
): string {
  const root = workspaceRoot();
  const target = path.resolve(root, repositoryId, enlistmentId);
  if (!target.startsWith(root + path.sep)) {
    throw new Error('Managed Scalar workspace escaped configured workspace root');
  }
  return target;
}

export function sanitizeCommandOutput(value: string): string {
  return value
    .replace(/https:\/\/[^\s/@]+:[^\s/@]+@github\.com/gi, 'https://***:***@github.com')
    .slice(0, 64 * 1024);
}
