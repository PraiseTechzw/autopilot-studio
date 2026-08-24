CREATE TABLE `companionStatusReceipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companionDeviceId` int NOT NULL,
	`repositoryId` int NOT NULL,
	`policyRevision` int NOT NULL,
	`policyDigest` varchar(128) NOT NULL,
	`branch` varchar(120) NOT NULL,
	`safetyStatus` enum('safe','blocked') NOT NULL,
	`safetyReasons` text NOT NULL,
	`changedFiles` int NOT NULL DEFAULT 0,
	`eligibleFiles` int NOT NULL DEFAULT 0,
	`companionVersion` varchar(40) NOT NULL,
	`payloadDigest` varchar(128) NOT NULL,
	`observedAt` timestamp NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companionStatusReceipts_id` PRIMARY KEY(`id`)
);
