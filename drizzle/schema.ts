import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const repositoryStatus = ["active", "paused", "needs_attention"] as const;
export const commitApprovalModes = ["automatic", "review", "manual"] as const;
export const pushApprovalModes = ["automatic", "review", "manual"] as const;
export const secretRiskModes = ["block", "review", "notify"] as const;
export const extensionCategories = ["ide", "git_host", "notification", "team_workflow"] as const;
export const extensionStatuses = ["ready", "attention", "offline"] as const;
export const activityTypes = ["queued", "committed", "pushed", "blocked", "paused", "extension", "recovery"] as const;
export const activityStatuses = ["info", "success", "warning", "blocked", "failed"] as const;
export const recoveryTypes = ["undo", "revert"] as const;
export const recoveryStatuses = ["available", "requested", "completed", "failed"] as const;
export const queuedActionKinds = ["commit", "push"] as const;
export const queuedActionRisks = ["low", "medium", "high"] as const;
export const queuedActionStatuses = ["pending", "approved", "rejected"] as const;
export const companionDeviceStatuses = ["active", "revoked"] as const;
export const githubConnectionStatuses = ["connected", "expired", "revoked", "attention"] as const;
export const githubBranchProtectionStatuses = ["protected", "unprotected", "unavailable"] as const;
export const workspaceRoles = ["owner", "admin", "reviewer", "member"] as const;
export const approvalDecisionValues = ["approved", "rejected"] as const;
export const companionStatusSafetyValues = ["safe", "blocked"] as const;

/** A repository record is metadata only; Autopilot Studio never stores source files. */
export const repositories = mysqlTable("repositories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  origin: varchar("origin", { length: 500 }).notNull(),
  defaultBranch: varchar("defaultBranch", { length: 120 }).notNull().default("main"),
  monitoringStatus: mysqlEnum("monitoringStatus", repositoryStatus).notNull().default("paused"),
  safetyScore: int("safetyScore").notNull().default(100),
  lastSeenAt: timestamp("lastSeenAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** One policy per repository; lists are serialised as JSON strings to keep the policy portable. */
export const automationPolicies = mysqlTable("automationPolicies", {
  id: int("id").autoincrement().primaryKey(),
  repositoryId: int("repositoryId").notNull().unique(),
  protectedBranches: text("protectedBranches").notNull(),
  debounceSeconds: int("debounceSeconds").notNull().default(20),
  commitApprovalMode: mysqlEnum("commitApprovalMode", commitApprovalModes).notNull().default("review"),
  pushApprovalMode: mysqlEnum("pushApprovalMode", pushApprovalModes).notNull().default("review"),
  ignoreRules: text("ignoreRules").notNull(),
  secretRiskMode: mysqlEnum("secretRiskMode", secretRiskModes).notNull().default("block"),
  revision: int("revision").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** User-level extension preferences; extension packages and capabilities are rendered from the catalog. */
export const extensionPreferences = mysqlTable("extensionPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  extensionKey: varchar("extensionKey", { length: 120 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  category: mysqlEnum("category", extensionCategories).notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  healthStatus: mysqlEnum("healthStatus", extensionStatuses).notNull().default("ready"),
  configuration: text("configuration").notNull(),
  permissionScopes: text("permissionScopes").notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Append-only metadata ledger explaining automation decisions without storing code content. */
export const activityLogs = mysqlTable("activityLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  repositoryId: int("repositoryId"),
  type: mysqlEnum("type", activityTypes).notNull(),
  status: mysqlEnum("status", activityStatuses).notNull().default("info"),
  title: varchar("title", { length: 255 }).notNull(),
  summary: text("summary").notNull(),
  metadata: text("metadata").notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

/** Recovery actions record a user-requested Git-native undo or revert route. */
export const recoveryActions = mysqlTable("recoveryActions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  repositoryId: int("repositoryId").notNull(),
  activityLogId: int("activityLogId"),
  type: mysqlEnum("type", recoveryTypes).notNull(),
  targetRef: varchar("targetRef", { length: 255 }).notNull(),
  status: mysqlEnum("status", recoveryStatuses).notNull().default("available"),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

/** A local companion can submit action metadata here before it performs a commit or push. */
export const queuedActions = mysqlTable("queuedActions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  actorUserId: int("actorUserId"),
  companionDeviceId: int("companionDeviceId"),
  repositoryId: int("repositoryId").notNull(),
  kind: mysqlEnum("kind", queuedActionKinds).notNull(),
  branch: varchar("branch", { length: 120 }).notNull(),
  summary: text("summary").notNull(),
  changedFiles: int("changedFiles").notNull().default(0),
  riskLevel: mysqlEnum("riskLevel", queuedActionRisks).notNull().default("low"),
  status: mysqlEnum("status", queuedActionStatuses).notNull().default("pending"),
  decisionNote: text("decisionNote"),
  policyRevision: int("policyRevision").notNull().default(1),
  payloadDigest: varchar("payloadDigest", { length: 128 }).notNull().default(""),
  expiresAt: timestamp("expiresAt"),
  executionReceipt: text("executionReceipt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
});

/** All notification paths are off until the user opts into a category. */
export const notificationPreferences = mysqlTable("notificationPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  automationPaused: boolean("automationPaused").notNull().default(false),
  secretRiskBlocked: boolean("secretRiskBlocked").notNull().default(false),
  pushFailed: boolean("pushFailed").notNull().default(false),
  extensionNeedsAttention: boolean("extensionNeedsAttention").notNull().default(false),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** One-time pairing records enroll a local companion without exposing a session cookie. */
export const companionPairings = mysqlTable("companionPairings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  pairingCodeHash: varchar("pairingCodeHash", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Device records store only a token hash and companion public key, never local Git credentials. */
export const companionDevices = mysqlTable("companionDevices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  publicKey: text("publicKey").notNull(),
  status: mysqlEnum("status", companionDeviceStatuses).notNull().default("active"),
  lastSeenAt: timestamp("lastSeenAt"),
  lastPolicyRevision: int("lastPolicyRevision"),
  lastPolicySyncedAt: timestamp("lastPolicySyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

/** Signed snapshot metadata for one companion and repository; no policy payload or source content is retained. */
export const companionPolicySnapshots = mysqlTable("companionPolicySnapshots", {
  id: int("id").autoincrement().primaryKey(),
  companionDeviceId: int("companionDeviceId").notNull(),
  repositoryId: int("repositoryId").notNull(),
  policyRevision: int("policyRevision").notNull(),
  policyDigest: varchar("policyDigest", { length: 128 }).notNull(),
  issuedAt: timestamp("issuedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
});

/** Device-signed local inspection metadata. No file names, diffs, source contents, remotes, or credentials are retained. */
export const companionStatusReceipts = mysqlTable("companionStatusReceipts", {
  id: int("id").autoincrement().primaryKey(),
  companionDeviceId: int("companionDeviceId").notNull(),
  repositoryId: int("repositoryId").notNull(),
  policyRevision: int("policyRevision").notNull(),
  policyDigest: varchar("policyDigest", { length: 128 }).notNull(),
  branch: varchar("branch", { length: 120 }).notNull(),
  safetyStatus: mysqlEnum("safetyStatus", companionStatusSafetyValues).notNull(),
  safetyReasons: text("safetyReasons").notNull(),
  changedFiles: int("changedFiles").notNull().default(0),
  eligibleFiles: int("eligibleFiles").notNull().default(0),
  companionVersion: varchar("companionVersion", { length: 40 }).notNull(),
  payloadDigest: varchar("payloadDigest", { length: 128 }).notNull(),
  observedAt: timestamp("observedAt").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
});

/** A connection stores an encrypted GitHub App user token plus selected-installation metadata. */
export const githubConnections = mysqlTable("githubConnections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  githubUserId: varchar("githubUserId", { length: 80 }).notNull(),
  login: varchar("login", { length: 120 }).notNull(),
  installationId: varchar("installationId", { length: 80 }),
  selectedRepositoryIds: text("selectedRepositoryIds").notNull(),
  grantedPermissions: text("grantedPermissions").notNull(),
  tokenCiphertext: text("tokenCiphertext").notNull(),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  status: mysqlEnum("status", githubConnectionStatuses).notNull().default("connected"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** OAuth state records prevent callback substitution and are single use. */
export const githubOAuthStates = mysqlTable("githubOAuthStates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  stateHash: varchar("stateHash", { length: 128 }).notNull().unique(),
  codeVerifier: varchar("codeVerifier", { length: 160 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Selected GitHub repositories are metadata-only records; source content is never stored. */
export const githubRepositorySelections = mysqlTable("githubRepositorySelections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  githubRepositoryId: varchar("githubRepositoryId", { length: 80 }).notNull(),
  fullName: varchar("fullName", { length: 300 }).notNull(),
  defaultBranch: varchar("defaultBranch", { length: 120 }).notNull(),
  branchProtectionStatus: mysqlEnum("branchProtectionStatus", githubBranchProtectionStatuses).notNull().default("unavailable"),
  selected: boolean("selected").notNull().default(false),
  lastSyncedAt: timestamp("lastSyncedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Nonces prevent a signed companion request from being replayed within its validity window. */
export const companionRequestNonces = mysqlTable("companionRequestNonces", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull(),
  nonceHash: varchar("nonceHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** A workspace groups repositories and approval participants without granting GitHub access. */
export const teamWorkspaces = mysqlTable("teamWorkspaces", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workspaceMemberships = mysqlTable("workspaceMemberships", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", workspaceRoles).notNull().default("member"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** One repository can have one team rule, including quorum and separation-of-duties controls. */
export const repositoryApprovalRules = mysqlTable("repositoryApprovalRules", {
  id: int("id").autoincrement().primaryKey(),
  repositoryId: int("repositoryId").notNull().unique(),
  workspaceId: int("workspaceId").notNull(),
  commitRequiresApproval: boolean("commitRequiresApproval").notNull().default(true),
  pushRequiresApproval: boolean("pushRequiresApproval").notNull().default(true),
  approvalQuorum: int("approvalQuorum").notNull().default(1),
  allowSelfApproval: boolean("allowSelfApproval").notNull().default(false),
  actionExpiryMinutes: int("actionExpiryMinutes").notNull().default(60),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Approval decisions are append-only and separate from the action's final status. */
export const approvalDecisions = mysqlTable("approvalDecisions", {
  id: int("id").autoincrement().primaryKey(),
  queuedActionId: int("queuedActionId").notNull(),
  reviewerUserId: int("reviewerUserId").notNull(),
  decision: mysqlEnum("decision", approvalDecisionValues).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Repository = typeof repositories.$inferSelect;
export type AutomationPolicy = typeof automationPolicies.$inferSelect;
export type ExtensionPreference = typeof extensionPreferences.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type RecoveryAction = typeof recoveryActions.$inferSelect;
export type QueuedAction = typeof queuedActions.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type CompanionPairing = typeof companionPairings.$inferSelect;
export type CompanionDevice = typeof companionDevices.$inferSelect;
export type CompanionPolicySnapshot = typeof companionPolicySnapshots.$inferSelect;
export type CompanionStatusReceipt = typeof companionStatusReceipts.$inferSelect;
export type GitHubConnection = typeof githubConnections.$inferSelect;
export type GitHubOAuthState = typeof githubOAuthStates.$inferSelect;
export type GitHubRepositorySelection = typeof githubRepositorySelections.$inferSelect;
export type CompanionRequestNonce = typeof companionRequestNonces.$inferSelect;
export type TeamWorkspace = typeof teamWorkspaces.$inferSelect;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type RepositoryApprovalRule = typeof repositoryApprovalRules.$inferSelect;
export type ApprovalDecision = typeof approvalDecisions.$inferSelect;
