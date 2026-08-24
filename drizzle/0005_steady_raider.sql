CREATE TABLE `githubRepositorySelections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`githubRepositoryId` varchar(80) NOT NULL,
	`fullName` varchar(300) NOT NULL,
	`defaultBranch` varchar(120) NOT NULL,
	`branchProtectionStatus` enum('protected','unprotected','unavailable') NOT NULL DEFAULT 'unavailable',
	`selected` boolean NOT NULL DEFAULT false,
	`lastSyncedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `githubRepositorySelections_id` PRIMARY KEY(`id`)
);
