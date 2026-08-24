import { and, eq } from "drizzle-orm";
import { githubConnections, githubRepositorySelections } from "../drizzle/schema";
import { getDb } from "./db";
import { decryptGitHubToken } from "./githubAuth";

export const githubReadOnlyPermissions = ["repository_metadata:read", "administration:read"] as const;

type GitHubRepository = { id: number; full_name: string; default_branch: string };

async function getConnectionToken(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const connection = (await db.select().from(githubConnections).where(eq(githubConnections.userId, userId)).limit(1))[0];
  if (!connection || connection.status !== "connected") throw new Error("A connected GitHub App account is required.");
  return { db, token: decryptGitHubToken(connection.tokenCiphertext) };
}

async function githubFetch(token: string, pathOrUrl: string) {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `https://api.github.com${pathOrUrl}`;
  return fetch(url, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "Autopilot-Studio", "X-GitHub-Api-Version": "2026-03-10" } });
}

async function listAccessibleRepositories(token: string): Promise<GitHubRepository[]> {
  const installationsResponse = await githubFetch(token, "/user/installations");
  const installationsPayload = await installationsResponse.json() as { installations?: { repositories_url?: string }[] };
  const repositories: GitHubRepository[] = [];
  if (installationsResponse.ok && installationsPayload.installations?.length) {
    for (const installation of installationsPayload.installations.slice(0, 25)) {
      if (!installation.repositories_url) continue;
      const response = await githubFetch(token, `${installation.repositories_url}?per_page=100`);
      const payload = await response.json() as { repositories?: GitHubRepository[] };
      if (response.ok) repositories.push(...(payload.repositories ?? []));
    }
  } else {
    const response = await githubFetch(token, "/user/repos?per_page=100&sort=updated");
    const payload = await response.json() as GitHubRepository[];
    if (!response.ok) throw new Error("GitHub repository metadata could not be read.");
    repositories.push(...payload);
  }
  return Array.from(new Map(repositories.map(repository => [repository.id, repository])).values());
}

export async function syncGitHubRepositoryCatalog(userId: number) {
  const { db, token } = await getConnectionToken(userId);
  const repositories = await listAccessibleRepositories(token);
  for (const repository of repositories) {
    const existing = (await db.select().from(githubRepositorySelections).where(and(eq(githubRepositorySelections.userId, userId), eq(githubRepositorySelections.githubRepositoryId, String(repository.id)))).limit(1))[0];
    const values = { userId, githubRepositoryId: String(repository.id), fullName: repository.full_name, defaultBranch: repository.default_branch, lastSyncedAt: new Date() };
    if (existing) await db.update(githubRepositorySelections).set(values).where(eq(githubRepositorySelections.id, existing.id));
    else await db.insert(githubRepositorySelections).values({ ...values, selected: false, branchProtectionStatus: "unavailable" });
  }
  return getGitHubRepositorySelections(userId);
}

async function getBranchProtectionStatus(token: string, fullName: string, defaultBranch: string): Promise<"protected" | "unprotected" | "unavailable"> {
  const response = await githubFetch(token, `/repos/${fullName}/branches/${encodeURIComponent(defaultBranch)}/protection`);
  if (response.ok) return "protected";
  if (response.status === 404) return "unprotected";
  return "unavailable";
}

export async function setSelectedGitHubRepositories(userId: number, repositoryIds: string[]) {
  const { db, token } = await getConnectionToken(userId);
  const selections = await getGitHubRepositorySelections(userId);
  const requested = new Set(repositoryIds);
  for (const selection of selections) {
    const selected = requested.has(selection.githubRepositoryId);
    const branchProtectionStatus = selected
      ? await getBranchProtectionStatus(token, selection.fullName, selection.defaultBranch)
      : selection.branchProtectionStatus;
    await db.update(githubRepositorySelections).set({ selected, branchProtectionStatus, lastSyncedAt: new Date() }).where(eq(githubRepositorySelections.id, selection.id));
  }
  const selectedIds = selections.filter(selection => requested.has(selection.githubRepositoryId)).map(selection => selection.githubRepositoryId);
  await db.update(githubConnections).set({ selectedRepositoryIds: JSON.stringify(selectedIds) }).where(eq(githubConnections.userId, userId));
  return getGitHubRepositorySelections(userId);
}

export async function getGitHubRepositorySelections(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(githubRepositorySelections).where(eq(githubRepositorySelections.userId, userId));
}
