export type RepositoryBranchPosture = {
  id: number;
  defaultBranch: string;
};

export type RepositoryPolicyPosture = {
  repositoryId: number;
  protectedBranches: string;
};

export type ProtectedBranchCoverage = {
  covered: number;
  total: number;
  uncoveredRepositoryIds: number[];
};

function parseProtectedBranches(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((branch): branch is string => typeof branch === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Computes default-branch policy coverage per repository. The result deliberately
 * looks up each repository's own policy instead of reusing a selected policy.
 */
export function protectedBranchCoverage(
  repositories: RepositoryBranchPosture[],
  policies: RepositoryPolicyPosture[]
): ProtectedBranchCoverage {
  const policyByRepository = new Map(policies.map(policy => [policy.repositoryId, parseProtectedBranches(policy.protectedBranches)]));
  const uncoveredRepositoryIds = repositories
    .filter(repository => !(policyByRepository.get(repository.id) ?? []).includes(repository.defaultBranch))
    .map(repository => repository.id);

  return {
    covered: repositories.length - uncoveredRepositoryIds.length,
    total: repositories.length,
    uncoveredRepositoryIds,
  };
}
