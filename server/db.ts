import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activityLogs,
  automationPolicies,
  companionDevices,
  extensionPreferences,
  githubConnections,
  InsertUser,
  notificationPreferences,
  queuedActions,
  recoveryActions,
  repositories,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getStudioSnapshot(userId: number) {
  const db = await getDb();
  if (!db) {
    return { repositories: [], policies: [], extensions: [], activity: [], recovery: [], queuedActions: [], notifications: null, devices: [], githubConnection: null };
  }
  const [repositoryRows, extensionRows, activityRows, recoveryRows, queuedActionRows, notificationRows, deviceRows, githubRows] = await Promise.all([
    db.select().from(repositories).where(eq(repositories.userId, userId)).orderBy(desc(repositories.updatedAt)),
    db.select().from(extensionPreferences).where(eq(extensionPreferences.userId, userId)).orderBy(desc(extensionPreferences.updatedAt)),
    db.select().from(activityLogs).where(eq(activityLogs.userId, userId)).orderBy(desc(activityLogs.occurredAt)).limit(100),
    db.select().from(recoveryActions).where(eq(recoveryActions.userId, userId)).orderBy(desc(recoveryActions.requestedAt)).limit(50),
    db.select().from(queuedActions).where(eq(queuedActions.userId, userId)).orderBy(desc(queuedActions.createdAt)).limit(100),
    db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1),
    db.select().from(companionDevices).where(eq(companionDevices.userId, userId)).orderBy(desc(companionDevices.createdAt)),
    db.select().from(githubConnections).where(eq(githubConnections.userId, userId)).limit(1),
  ]);
  const repositoryIds = repositoryRows.map(repository => repository.id);
  const policyRows = repositoryIds.length
    ? await db.select().from(automationPolicies).where(eq(automationPolicies.repositoryId, repositoryIds[0]!))
    : [];
  const policies = repositoryIds.length > 1
    ? await Promise.all(repositoryIds.map(id => db.select().from(automationPolicies).where(eq(automationPolicies.repositoryId, id)).limit(1)))
    : [policyRows];

  return {
    repositories: repositoryRows,
    policies: policies.flat(),
    extensions: extensionRows,
    activity: activityRows,
    recovery: recoveryRows,
    queuedActions: queuedActionRows,
    notifications: notificationRows[0] ?? null,
    devices: deviceRows.map(({ tokenHash, publicKey, ...device }) => device),
    githubConnection: githubRows[0] ? (() => { const { tokenCiphertext, ...connection } = githubRows[0]; return connection; })() : null,
  };
}

export async function getRepositoryForUser(userId: number, repositoryId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.id, repositoryId), eq(repositories.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createRepositoryForUser(input: {
  userId: number;
  name: string;
  origin: string;
  defaultBranch: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(repositories).values({
    ...input,
    monitoringStatus: "paused",
    safetyScore: 100,
  });
  return Number(result[0].insertId);
}

export async function saveAutomationPolicy(input: {
  repositoryId: number;
  protectedBranches: string;
  debounceSeconds: number;
  commitApprovalMode: "automatic" | "review" | "manual";
  pushApprovalMode: "automatic" | "review" | "manual";
  ignoreRules: string;
  secretRiskMode: "block" | "review" | "notify";
}) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(automationPolicies).values(input).onDuplicateKeyUpdate({ set: input });
  return true;
}

export async function saveExtensionPreference(input: {
  userId: number;
  extensionKey: string;
  name: string;
  category: "ide" | "git_host" | "notification" | "team_workflow";
  description: string;
  enabled: boolean;
  configuration: string;
  permissionScopes: string;
}) {
  const db = await getDb();
  if (!db) return false;
  const existing = await db
    .select()
    .from(extensionPreferences)
    .where(and(eq(extensionPreferences.userId, input.userId), eq(extensionPreferences.extensionKey, input.extensionKey)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(extensionPreferences)
      .set({ ...input, healthStatus: "ready", lastCheckedAt: new Date() })
      .where(eq(extensionPreferences.id, existing[0].id));
  } else {
    await db.insert(extensionPreferences).values({ ...input, healthStatus: "ready", lastCheckedAt: new Date() });
  }
  return true;
}

export async function writeActivity(input: {
  userId: number;
  repositoryId?: number;
  type: "queued" | "committed" | "pushed" | "blocked" | "paused" | "extension" | "recovery";
  status: "info" | "success" | "warning" | "blocked" | "failed";
  title: string;
  summary: string;
  metadata?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(activityLogs).values({
    ...input,
    repositoryId: input.repositoryId ?? null,
    metadata: input.metadata ?? "{}",
  });
  return Number(result[0].insertId);
}

export async function createRecoveryAction(input: {
  userId: number;
  repositoryId: number;
  activityLogId?: number;
  type: "undo" | "revert";
  targetRef: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(recoveryActions).values({
    ...input,
    activityLogId: input.activityLogId ?? null,
    status: "requested",
  });
  return Number(result[0].insertId);
}

export async function createQueuedAction(input: {
  userId: number;
  actorUserId?: number;
  companionDeviceId?: number;
  repositoryId: number;
  kind: "commit" | "push";
  branch: string;
  summary: string;
  changedFiles: number;
  riskLevel: "low" | "medium" | "high";
  policyRevision?: number;
  payloadDigest?: string;
  expiresAt?: Date;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(queuedActions).values({
    ...input,
    actorUserId: input.actorUserId ?? input.userId,
    companionDeviceId: input.companionDeviceId ?? null,
    policyRevision: input.policyRevision ?? 1,
    payloadDigest: input.payloadDigest ?? "",
    expiresAt: input.expiresAt ?? null,
    status: "pending",
  });
  return Number(result[0].insertId);
}

export async function reviewQueuedAction(input: {
  userId: number;
  actionId: number;
  decision: "approved" | "rejected";
  decisionNote?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const existing = await db
    .select()
    .from(queuedActions)
    .where(and(eq(queuedActions.id, input.actionId), eq(queuedActions.userId, input.userId)))
    .limit(1);
  const action = existing[0];
  if (!action || action.status !== "pending") return null;
  await db
    .update(queuedActions)
    .set({ status: input.decision, decisionNote: input.decisionNote ?? null, reviewedAt: new Date() })
    .where(eq(queuedActions.id, input.actionId));
  return action;
}

export async function saveNotificationPreferences(input: {
  userId: number;
  automationPaused: boolean;
  secretRiskBlocked: boolean;
  pushFailed: boolean;
  extensionNeedsAttention: boolean;
}) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(notificationPreferences).values(input).onDuplicateKeyUpdate({ set: input });
  return true;
}

export async function getNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return result[0] ?? null;
}
