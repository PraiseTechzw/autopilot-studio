CREATE TABLE `companionPolicySnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companionDeviceId` int NOT NULL,
	`repositoryId` int NOT NULL,
	`policyRevision` int NOT NULL,
	`policyDigest` varchar(128) NOT NULL,
	`issuedAt` timestamp NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`confirmedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companionPolicySnapshots_id` PRIMARY KEY(`id`)
);
