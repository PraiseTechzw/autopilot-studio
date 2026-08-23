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
  repositoryId: int("repositoryId").notNull(),
  kind: mysqlEnum("kind", queuedActionKinds).notNull(),
  branch: varchar("branch", { length: 120 }).notNull(),
  summary: text("summary").notNull(),
  changedFiles: int("changedFiles").notNull().default(0),
  riskLevel: mysqlEnum("riskLevel", queuedActionRisks).notNull().default("low"),
  status: mysqlEnum("status", queuedActionStatuses).notNull().default("pending"),
  decisionNote: text("decisionNote"),
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Repository = typeof repositories.$inferSelect;
export type AutomationPolicy = typeof automationPolicies.$inferSelect;
export type ExtensionPreference = typeof extensionPreferences.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type RecoveryAction = typeof recoveryActions.$inferSelect;
export type QueuedAction = typeof queuedActions.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
