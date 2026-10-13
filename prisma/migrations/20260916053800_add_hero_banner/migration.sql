-- CreateTable
CREATE TABLE "hero_banners" (
    "id" TEXT NOT NULL,
    "mobileImageUrl" TEXT,
    "webImageUrl" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "description" TEXT,
    "actionUrl" TEXT,
    "actionButtonName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_banners_pkey" PRIMARY KEY ("id")
);
