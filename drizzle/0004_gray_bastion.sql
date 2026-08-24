CREATE TABLE `companionRequestNonces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int NOT NULL,
	`nonceHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companionRequestNonces_id` PRIMARY KEY(`id`),
	CONSTRAINT `companionRequestNonces_nonceHash_unique` UNIQUE(`nonceHash`)
);
--> statement-breakpoint
CREATE TABLE `githubOAuthStates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stateHash` varchar(128) NOT NULL,
	`codeVerifier` varchar(160) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `githubOAuthStates_id` PRIMARY KEY(`id`),
	CONSTRAINT `githubOAuthStates_stateHash_unique` UNIQUE(`stateHash`)
);
--> statement-breakpoint
ALTER TABLE `automationPolicies` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `queuedActions` ADD `actorUserId` int;--> statement-breakpoint
ALTER TABLE `queuedActions` ADD `companionDeviceId` int;--> statement-breakpoint
ALTER TABLE `queuedActions` ADD `policyRevision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `queuedActions` ADD `payloadDigest` varchar(128) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `queuedActions` ADD `expiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `queuedActions` ADD `executionReceipt` text;