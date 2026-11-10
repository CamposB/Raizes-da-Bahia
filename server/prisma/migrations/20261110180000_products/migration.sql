-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `unit` ENUM('KG', 'UN') NOT NULL DEFAULT 'KG',
    `price` DECIMAL(12, 2) NOT NULL,
    `usesLots` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Produto inicial: a goma de tapioca, com o preço que estava nas configurações
INSERT INTO `Product` (`id`, `name`, `unit`, `price`, `usesLots`, `active`, `sortOrder`, `updatedAt`)
VALUES (
    'prod_goma_tapioca', 'Goma de tapioca', 'KG',
    COALESCE((SELECT CAST(`value` AS DECIMAL(12, 2)) FROM `Setting` WHERE `key` = 'pricePerKg'), 21),
    true, true, 0, CURRENT_TIMESTAMP(3)
);

-- Todas as vendas existentes são de goma
ALTER TABLE `Sale` ADD COLUMN `productId` VARCHAR(191) NULL;
UPDATE `Sale` SET `productId` = 'prod_goma_tapioca';
ALTER TABLE `Sale` MODIFY `productId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Sale_productId_idx` ON `Sale`(`productId`);

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
