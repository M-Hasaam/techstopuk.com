-- AlterTable
ALTER TABLE "device_catalog" ADD COLUMN     "attributeOptions" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}';
