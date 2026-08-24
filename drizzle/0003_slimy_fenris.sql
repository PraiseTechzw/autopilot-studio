CREATE TABLE `approvalDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`queuedActionId` int NOT NULL,
	`reviewerUserId` int NOT NULL,
	`decision` enum('approved','rejected') NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `approvalDecisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companionDevices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceId` varchar(96) NOT NULL,
	`label` varchar(120) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`publicKey` text NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `companionDevices_id` PRIMARY KEY(`id`),
	CONSTRAINT `companionDevices_deviceId_unique` UNIQUE(`deviceId`),
	CONSTRAINT `companionDevices_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `companionPairings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`pairingCodeHash` varchar(128) NOT NULL,
	`label` varchar(120) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companionPairings_id` PRIMARY KEY(`id`),
	CONSTRAINT `companionPairings_pairingCodeHash_unique` UNIQUE(`pairingCodeHash`)
);
--> statement-breakpoint
CREATE TABLE `githubConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`githubUserId` varchar(80) NOT NULL,
	`login` varchar(120) NOT NULL,
	`installationId` varchar(80),
	`selectedRepositoryIds` text NOT NULL,
	`grantedPermissions` text NOT NULL,
	`tokenCiphertext` text NOT NULL,
	`tokenExpiresAt` timestamp,
	`status` enum('connected','expired','revoked','attention') NOT NULL DEFAULT 'connected',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `githubConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `githubConnections_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `repositoryApprovalRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repositoryId` int NOT NULL,
	`workspaceId` int NOT NULL,
	`commitRequiresApproval` boolean NOT NULL DEFAULT true,
	`pushRequiresApproval` boolean NOT NULL DEFAULT true,
	`approvalQuorum` int NOT NULL DEFAULT 1,
	`allowSelfApproval` boolean NOT NULL DEFAULT false,
	`actionExpiryMinutes` int NOT NULL DEFAULT 60,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repositoryApprovalRules_id` PRIMARY KEY(`id`),
	CONSTRAINT `repositoryApprovalRules_repositoryId_unique` UNIQUE(`repositoryId`)
);
--> statement-breakpoint
CREATE TABLE `teamWorkspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teamWorkspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaceMemberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','reviewer','member') NOT NULL DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaceMemberships_id` PRIMARY KEY(`id`)
);
