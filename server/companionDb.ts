import { and, desc, eq } from "drizzle-orm";
import {
  approvalDecisions,
  automationPolicies,
  companionDevices,
  companionPairings,
  companionRequestNonces,
  githubConnections,
  githubOAuthStates,
  queuedActions,
  repositories,
  repositoryApprovalRules,
  teamWorkspaces,
  users,
  workspaceMemberships,
} from "../drizzle/schema";
import { getDb } from "./db";

export async function createCompanionPairing(input: { userId: number; pairingCodeHash: string; label: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(companionPairings).values(input);
  return Number(result[0].insertId);
}

export async function consumeCompanionPairing(pairingCodeHash: string) {
  const db = await getDb();
  if (!db) return null;
  const pairing = (await db.select().from(companionPairings).where(eq(companionPairings.pairingCodeHash, pairingCodeHash)).limit(1))[0];
  if (!pairing || pairing.usedAt || pairing.expiresAt.getTime() < Date.now()) return null;
  await db.update(companionPairings).set({ usedAt: new Date() }).where(eq(companionPairings.id, pairing.id));
  return pairing;
}

export async function createCompanionDevice(input: { userId: number; deviceId: string; label: string; tokenHash: string; publicKey: string }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(companionDevices).values(input);
  return Number(result[0].insertId);
}

export async function getActiveCompanionDevice(deviceId: string, tokenHash: string) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(companionDevices).where(and(eq(companionDevices.deviceId, deviceId), eq(companionDevices.tokenHash, tokenHash), eq(companionDevices.status, "active"))).limit(1))[0] ?? null;
}

export async function touchCompanionDevice(deviceId: number) {
  const db = await getDb();
  if (!db) return false;
  await db.update(companionDevices).set({ lastSeenAt: new Date() }).where(eq(companionDevices.id, deviceId));
  return true;
}

export async function rememberCompanionNonce(input: { deviceId: number; nonceHash: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(companionRequestNonces).values(input);
    return true;
  } catch {
    return false;
  }
}

export async function getCompanionPolicy(userId: number, repositoryId: number) {
  const db = await getDb();
  if (!db) return null;
  const repository = (await db.select().from(repositories).where(and(eq(repositories.id, repositoryId), eq(repositories.userId, userId))).limit(1))[0];
  if (!repository) return null;
  const policy = (await db.select().from(automationPolicies).where(eq(automationPolicies.repositoryId, repositoryId)).limit(1))[0];
  const approvalRule = (await db.select().from(repositoryApprovalRules).where(eq(repositoryApprovalRules.repositoryId, repositoryId)).limit(1))[0] ?? null;
  return policy ? { repository, policy, approvalRule } : null;
}

export async function createTeamWorkspace(input: { ownerId: number; name: string }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(teamWorkspaces).values(input);
  const workspaceId = Number(result[0].insertId);
  await db.insert(workspaceMemberships).values({ workspaceId, userId: input.ownerId, role: "owner" });
  return workspaceId;
}

export function isWorkspaceManager(role: "owner" | "admin" | "reviewer" | "member" | null | undefined) {
  return role === "owner" || role === "admin";
}

export async function getWorkspaceManager(workspaceId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const membership = (await db.select().from(workspaceMemberships).where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.userId, userId))).limit(1))[0];
  return membership && isWorkspaceManager(membership.role) ? membership : null;
}

export async function getWorkspaceMembership(workspaceId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(workspaceMemberships).where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.userId, userId))).limit(1))[0] ?? null;
}

export async function addWorkspaceMembership(input: { workspaceId: number; userId: number; role: "admin" | "reviewer" | "member" }) {
  const db = await getDb();
  if (!db) return false;
  const existing = (await db.select().from(workspaceMemberships).where(and(eq(workspaceMemberships.workspaceId, input.workspaceId), eq(workspaceMemberships.userId, input.userId))).limit(1))[0];
  if (existing?.role === "owner") return false;
  if (existing) await db.update(workspaceMemberships).set({ role: input.role }).where(eq(workspaceMemberships.id, existing.id));
  else await db.insert(workspaceMemberships).values(input);
  return true;
}

export async function saveRepositoryApprovalRule(input: { repositoryId: number; workspaceId: number; commitRequiresApproval: boolean; pushRequiresApproval: boolean; approvalQuorum: number; allowSelfApproval: boolean; actionExpiryMinutes: number }) {
  const db = await getDb();
  if (!db) return false;
  const existing = (await db.select().from(repositoryApprovalRules).where(eq(repositoryApprovalRules.repositoryId, input.repositoryId)).limit(1))[0];
  if (existing) await db.update(repositoryApprovalRules).set(input).where(eq(repositoryApprovalRules.id, existing.id));
  else await db.insert(repositoryApprovalRules).values(input);
  return true;
}

export async function getActionApprovalContext(actionId: number) {
  const db = await getDb();
  if (!db) return null;
  const action = (await db.select().from(queuedActions).where(eq(queuedActions.id, actionId)).limit(1))[0];
  if (!action) return null;
  const rule = (await db.select().from(repositoryApprovalRules).where(eq(repositoryApprovalRules.repositoryId, action.repositoryId)).limit(1))[0] ?? null;
  const decisions = await db.select().from(approvalDecisions).where(eq(approvalDecisions.queuedActionId, actionId)).orderBy(desc(approvalDecisions.createdAt));
  return { action, rule, decisions };
}

export async function recordApprovalDecision(input: { queuedActionId: number; reviewerUserId: number; decision: "approved" | "rejected"; note?: string }) {
  const db = await getDb();
  if (!db) return null;
  const existing = (await db.select().from(approvalDecisions).where(and(eq(approvalDecisions.queuedActionId, input.queuedActionId), eq(approvalDecisions.reviewerUserId, input.reviewerUserId))).limit(1))[0];
  if (existing) return null;
  const result = await db.insert(approvalDecisions).values({ ...input, note: input.note ?? null });
  return Number(result[0].insertId);
}

export async function finalizeQueuedAction(input: { actionId: number; status: "approved" | "rejected"; note?: string }) {
  const db = await getDb();
  if (!db) return false;
  await db.update(queuedActions).set({ status: input.status, decisionNote: input.note ?? null, reviewedAt: new Date() }).where(eq(queuedActions.id, input.actionId));
  return true;
}

export async function saveExecutionReceipt(input: { actionId: number; receipt: string }) {
  const db = await getDb();
  if (!db) return false;
  await db.update(queuedActions).set({ executionReceipt: input.receipt }).where(eq(queuedActions.id, input.actionId));
  return true;
}

export async function getCompanionActionForDevice(input: { userId: number; companionDeviceId: number; actionId: number }) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(queuedActions).where(and(
    eq(queuedActions.id, input.actionId),
    eq(queuedActions.userId, input.userId),
    eq(queuedActions.companionDeviceId, input.companionDeviceId),
  )).limit(1))[0] ?? null;
}

export async function createGitHubOAuthState(input: { userId: number; stateHash: string; codeVerifier: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(githubOAuthStates).values(input);
  return true;
}

export async function consumeGitHubOAuthState(stateHash: string) {
  const db = await getDb();
  if (!db) return null;
  const state = (await db.select().from(githubOAuthStates).where(eq(githubOAuthStates.stateHash, stateHash)).limit(1))[0];
  if (!state || state.usedAt || state.expiresAt.getTime() < Date.now()) return null;
  await db.update(githubOAuthStates).set({ usedAt: new Date() }).where(eq(githubOAuthStates.id, state.id));
  return state;
}

export async function saveGitHubConnection(input: { userId: number; githubUserId: string; login: string; installationId?: string; selectedRepositoryIds: string; grantedPermissions: string; tokenCiphertext: string; tokenExpiresAt?: Date; status?: "connected" | "expired" | "revoked" | "attention" }) {
  const db = await getDb();
  if (!db) return false;
  const existing = (await db.select().from(githubConnections).where(eq(githubConnections.userId, input.userId)).limit(1))[0];
  const values = { ...input, installationId: input.installationId ?? null, tokenExpiresAt: input.tokenExpiresAt ?? null, status: input.status ?? "connected" } as const;
  if (existing) await db.update(githubConnections).set(values).where(eq(githubConnections.id, existing.id));
  else await db.insert(githubConnections).values(values);
  return true;
}

export async function getGitHubConnectionSummary(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const connection = (await db.select().from(githubConnections).where(eq(githubConnections.userId, userId)).limit(1))[0];
  if (!connection) return null;
  const { tokenCiphertext, ...safeConnection } = connection;
  return safeConnection;
}

export async function getTeamWorkflowSnapshot(userId: number) {
  const db = await getDb();
  if (!db) return { workspaces: [], memberships: [], workspaceMembers: [], approvalRules: [] };
  const memberships = await db.select().from(workspaceMemberships).where(eq(workspaceMemberships.userId, userId)).orderBy(desc(workspaceMemberships.updatedAt));
  const workspaceIds = memberships.map(membership => membership.workspaceId);
  const workspaces = workspaceIds.length
    ? (await Promise.all(workspaceIds.map(id => db.select().from(teamWorkspaces).where(eq(teamWorkspaces.id, id)).limit(1)))).flat()
    : [];
  const approvalRules = workspaceIds.length
    ? (await Promise.all(workspaceIds.map(id => db.select().from(repositoryApprovalRules).where(eq(repositoryApprovalRules.workspaceId, id))))).flat()
    : [];
  const workspaceMembers = workspaceIds.length
    ? (await Promise.all(workspaceIds.map(id => db.select().from(workspaceMemberships).where(eq(workspaceMemberships.workspaceId, id))))).flat()
    : [];
  const memberUserIds = Array.from(new Set(workspaceMembers.map(member => member.userId)));
  const memberUsers = memberUserIds.length
    ? (await Promise.all(memberUserIds.map(id => db.select().from(users).where(eq(users.id, id)).limit(1)))).flat()
    : [];
  const namesByUserId = new Map(memberUsers.map(user => [user.id, user.name || user.email || `User #${user.id}`]));
  return {
    workspaces,
    memberships,
    workspaceMembers: workspaceMembers.map(member => ({ ...member, name: namesByUserId.get(member.userId) ?? `User #${member.userId}` })),
    approvalRules,
  };
}
