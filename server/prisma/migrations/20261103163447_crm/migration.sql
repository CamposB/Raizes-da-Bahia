-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `optOut` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `MessageTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactLog` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `channel` ENUM('WHATSAPP', 'LIGACAO', 'PESSOALMENTE', 'OUTRO') NOT NULL DEFAULT 'WHATSAPP',
    `status` ENUM('MANUAL', 'QUEUED', 'SENT', 'FAILED') NOT NULL DEFAULT 'MANUAL',
    `templateId` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `notes` TEXT NULL,
    `error` TEXT NULL,
    `scheduledAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NULL,

    INDEX `ContactLog_customerId_sentAt_idx`(`customerId`, `sentAt`),
    INDEX `ContactLog_status_scheduledAt_idx`(`status`, `scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContactLog` ADD CONSTRAINT `ContactLog_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContactLog` ADD CONSTRAINT `ContactLog_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `MessageTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContactLog` ADD CONSTRAINT `ContactLog_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
