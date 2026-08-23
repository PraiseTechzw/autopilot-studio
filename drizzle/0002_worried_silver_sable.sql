CREATE TABLE `queuedActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`repositoryId` int NOT NULL,
	`kind` enum('commit','push') NOT NULL,
	`branch` varchar(120) NOT NULL,
	`summary` text NOT NULL,
	`changedFiles` int NOT NULL DEFAULT 0,
	`riskLevel` enum('low','medium','high') NOT NULL DEFAULT 'low',
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`decisionNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `queuedActions_id` PRIMARY KEY(`id`)
);
