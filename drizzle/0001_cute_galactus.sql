CREATE TABLE `activityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`repositoryId` int,
	`type` enum('queued','committed','pushed','blocked','paused','extension','recovery') NOT NULL,
	`status` enum('info','success','warning','blocked','failed') NOT NULL DEFAULT 'info',
	`title` varchar(255) NOT NULL,
	`summary` text NOT NULL,
	`metadata` text NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automationPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repositoryId` int NOT NULL,
	`protectedBranches` text NOT NULL,
	`debounceSeconds` int NOT NULL DEFAULT 20,
	`commitApprovalMode` enum('automatic','review','manual') NOT NULL DEFAULT 'review',
	`pushApprovalMode` enum('automatic','review','manual') NOT NULL DEFAULT 'review',
	`ignoreRules` text NOT NULL,
	`secretRiskMode` enum('block','review','notify') NOT NULL DEFAULT 'block',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automationPolicies_id` PRIMARY KEY(`id`),
	CONSTRAINT `automationPolicies_repositoryId_unique` UNIQUE(`repositoryId`)
);
--> statement-breakpoint
CREATE TABLE `extensionPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`extensionKey` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`category` enum('ide','git_host','notification','team_workflow') NOT NULL,
	`description` text NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`healthStatus` enum('ready','attention','offline') NOT NULL DEFAULT 'ready',
	`configuration` text NOT NULL,
	`permissionScopes` text NOT NULL,
	`lastCheckedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extensionPreferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`automationPaused` boolean NOT NULL DEFAULT false,
	`secretRiskBlocked` boolean NOT NULL DEFAULT false,
	`pushFailed` boolean NOT NULL DEFAULT false,
	`extensionNeedsAttention` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationPreferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `recoveryActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`repositoryId` int NOT NULL,
	`activityLogId` int,
	`type` enum('undo','revert') NOT NULL,
	`targetRef` varchar(255) NOT NULL,
	`status` enum('available','requested','completed','failed') NOT NULL DEFAULT 'available',
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `recoveryActions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`origin` varchar(500) NOT NULL,
	`defaultBranch` varchar(120) NOT NULL DEFAULT 'main',
	`monitoringStatus` enum('active','paused','needs_attention') NOT NULL DEFAULT 'paused',
	`safetyScore` int NOT NULL DEFAULT 100,
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repositories_id` PRIMARY KEY(`id`)
);
