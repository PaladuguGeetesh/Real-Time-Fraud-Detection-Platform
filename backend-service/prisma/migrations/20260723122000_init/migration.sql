-- CreateTable
CREATE TABLE `Transaction` (
    `transactionId` VARCHAR(191) NOT NULL,
    `bankId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `merchant` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `cardType` VARCHAR(191) NOT NULL,
    `device` VARCHAR(191) NOT NULL,
    `prediction` VARCHAR(191) NOT NULL,
    `riskScore` DOUBLE NOT NULL,
    `modelVersion` VARCHAR(191) NOT NULL,
    `groundTruth` INTEGER NOT NULL,
    `predictionCorrect` BOOLEAN NOT NULL,
    `features` JSON NOT NULL,

    INDEX `Transaction_prediction_idx`(`prediction`),
    INDEX `Transaction_country_idx`(`country`),
    INDEX `Transaction_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`transactionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
