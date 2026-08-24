CREATE TABLE `companionDeviceEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companionDeviceId` int NOT NULL,
	`type` enum('revoked','rotation_started') NOT NULL,
	`reason` enum('user_requested','lost_or_stolen','suspected_compromise','credential_rotation') NOT NULL,
	`replacementLabel` varchar(120),
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companionDeviceEvents_id` PRIMARY KEY(`id`)
);
