-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'MODERATOR', 'DEALER', 'DEALER_STAFF', 'USER');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE', 'APPLE', 'WHATSAPP_OTP');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('DASHBOARD_VIEW', 'CARS_VIEW', 'CARS_MANAGE', 'CARS_REVIEW', 'CAR_ANALYTICS_VIEW', 'LISTING_SETTINGS_VIEW', 'LISTING_SETTINGS_MANAGE', 'DEALERS_VIEW', 'DEALERS_MANAGE', 'DEALERS_APPLICATIONS_REVIEW', 'DEALER_ANALYTICS_VIEW', 'FEATURED_PLANS_VIEW', 'FEATURED_PLANS_MANAGE', 'FEATURED_CARS_VIEW', 'SUBSCRIPTION_PLANS_VIEW', 'SUBSCRIPTION_PLANS_MANAGE', 'DEALER_SUBSCRIPTIONS_VIEW', 'USERS_VIEW', 'MODERATORS_VIEW', 'MODERATORS_MANAGE', 'OPTIONS_VIEW', 'OPTIONS_MANAGE', 'BANNERS_VIEW', 'BANNERS_MANAGE', 'SUPPORT_VIEW', 'SUPPORT_REPLY', 'SUPPORT_UPDATE_STATUS');

-- CreateEnum
CREATE TYPE "DealerStaffPermission" AS ENUM ('DASHBOARD_VIEW', 'CAR_LISTINGS_VIEW', 'CAR_DETAILS_VIEW', 'CAR_EDIT', 'CAR_ADD', 'CAR_FEATURE', 'CAR_MARK_SOLD', 'CAR_PAYMENT', 'STAFF_VIEW', 'STAFF_ADD', 'STAFF_EDIT', 'STAFF_DELETE', 'VISIT_INQUIRIES_VIEW', 'BULK_UPLOAD', 'ANALYTICS_VIEW', 'SUBSCRIPTION_VIEW', 'SUBSCRIPTION_PURCHASE', 'SUBSCRIPTION_RENEW', 'INVOICES_VIEW', 'CHATS_MANAGE');

-- CreateEnum
CREATE TYPE "ListingPurpose" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED', 'RESUBMITTED', 'SOLD', 'PENDING_PAYMENT');

-- CreateEnum
CREATE TYPE "ListingReviewAction" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED', 'EDITED_BY_ADMIN', 'FLAGGED_DUPLICATE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMITTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TRADE_LICENSE', 'ID_CARD', 'PASSPORT', 'BUSINESS_REGISTRATION', 'RERA_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'LOCATION');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('REPORT_LISTING', 'REPORT_USER', 'PAYMENT', 'GENERAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ATTENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PENDING', 'ACCEPTED', 'RESCHEDULED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeaturedPlacementLocation" AS ENUM ('HOME_PAGE', 'LISTING_PAGE', 'CAR_DETAIL_PAGE');

-- CreateEnum
CREATE TYPE "TrackingLogType" AS ENUM ('IMPRESSION', 'VIEW', 'WHATSAPP_CLICK');

-- CreateEnum
CREATE TYPE "FeaturedPlanDuration" AS ENUM ('SEVEN_DAYS', 'TWENTY_DAYS', 'THIRTY_DAYS');

-- CreateEnum
CREATE TYPE "FeaturedPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'FREE');

-- CreateEnum
CREATE TYPE "DealerSubPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FREE', 'FAILED');

-- CreateEnum
CREATE TYPE "ListingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FREE', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('LISTING_PAYMENT', 'FEATURED_LISTING', 'DEALER_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PAID', 'FREE');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC');

-- CreateEnum
CREATE TYPE "CarCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "CarListingDraftSource" AS ENUM ('JSON', 'EXCEL', 'CSV');

-- CreateEnum
CREATE TYPE "CarListingDraftStatus" AS ENUM ('PENDING', 'USED', 'DISCARDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "password" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "googleId" TEXT,
    "appleId" TEXT,
    "isProfileComplete" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "freeListingsUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderator_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "permissions" "Permission"[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealerName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "tagline" TEXT,
    "coverImage" TEXT,
    "logoImage" TEXT,
    "tradeNumber" TEXT,
    "reraNumber" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Saudi Arabia',
    "website" TEXT,
    "description" TEXT,
    "facebook" TEXT,
    "youtube" TEXT,
    "whatsapp" TEXT,
    "instagram" TEXT,
    "availableFreeListings" INTEGER NOT NULL DEFAULT 0,
    "availableFreeFeatured" INTEGER NOT NULL DEFAULT 0,
    "subscriptionValidUntil" TIMESTAMP(3),
    "currentListingDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentFeaturingDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_applications" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "dealerName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "tradeNumber" TEXT,
    "reraNumber" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Saudi Arabia',
    "website" TEXT,
    "description" TEXT,
    "additionalContacts" JSONB,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "editToken" TEXT,
    "editTokenExpiry" TIMESTAMP(3),
    "dealerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_documents" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "minioKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_reviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "reviewedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_listings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "referenceCode" TEXT,
    "slug" TEXT,
    "description" TEXT,
    "purpose" "ListingPurpose" NOT NULL DEFAULT 'SALE',
    "modelId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isPotentialDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "modelYear" INTEGER,
    "mileage" DOUBLE PRECISION,
    "transmission" "TransmissionType",
    "fuelType" "FuelType",
    "condition" "CarCondition" NOT NULL DEFAULT 'USED',
    "exteriorColor" TEXT,
    "interiorColor" TEXT,
    "cylinders" INTEGER,
    "doors" INTEGER,
    "vin" TEXT,
    "carTypeId" TEXT,
    "extraProperties" JSONB,
    "price" DOUBLE PRECISION NOT NULL,
    "priceNegotiable" BOOLEAN NOT NULL DEFAULT false,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "areaName" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Saudi Arabia',
    "contactPhone" TEXT,
    "contactWhatsapp" TEXT,
    "contactVerified" BOOLEAN NOT NULL DEFAULT false,
    "otherFeatures" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'PENDING',
    "submissionCount" INTEGER NOT NULL DEFAULT 1,
    "paymentStatus" "ListingPaymentStatus" NOT NULL DEFAULT 'FREE',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "soldAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "impressionsCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "reachCount" INTEGER NOT NULL DEFAULT 0,
    "whatsappClicksCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_listing_tracking_logs" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "TrackingLogType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "car_listing_tracking_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_listing_photos" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "minioKey" TEXT,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "car_listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_listing_reviews" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "action" "ListingReviewAction" NOT NULL,
    "message" TEXT,
    "snapshot" JSONB,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "car_listing_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_listing_drafts" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "source" "CarListingDraftSource" NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "dealerUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "CarListingDraftStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "errors" JSONB,
    "listingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_listing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_records" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_staff" (
    "id" TEXT NOT NULL,
    "dealerUserId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "position" TEXT,
    "permissions" "DealerStaffPermission"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_participants" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "mediaUrl" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "listingId" TEXT,
    "reportedUserId" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_replies" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_visits" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "proposedAt" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locations" "FeaturedPlacementLocation"[],
    "duration" "FeaturedPlanDuration" NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_subscriptions" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "location" "FeaturedPlacementLocation" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "paymentStatus" "FeaturedPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "stripeSessionId" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "discountApplied" DOUBLE PRECISION,
    "addedByAdminId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_feature_options" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_feature_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_tag_options" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_tag_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_type_options" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_type_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_model_options" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_model_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_brand_options" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_brand_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxListings" INTEGER NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freeListings" INTEGER NOT NULL DEFAULT 0,
    "freeFeaturedListings" INTEGER NOT NULL DEFAULT 0,
    "listingDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "boostDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_subscriptions" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "paymentStatus" "DealerSubPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "stripeSessionId" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "assignedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PAID',
    "billedToId" TEXT NOT NULL,
    "billedToName" TEXT NOT NULL,
    "billedToEmail" TEXT,
    "billedToPhone" TEXT,
    "billedToCompany" TEXT,
    "billedToTradeNumber" TEXT,
    "billedToAddress" TEXT,
    "description" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "referenceId" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "paymentMethod" TEXT NOT NULL DEFAULT 'Stripe',
    "paidAt" TIMESTAMP(3),
    "pdfObjectKey" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_banners" (
    "id" TEXT NOT NULL,
    "mobileImageUrl" TEXT,
    "webImageUrl" TEXT NOT NULL,
    "title" TEXT,
    "arabicTitle" TEXT,
    "subtitle" TEXT,
    "description" TEXT,
    "arabicHeroText" TEXT,
    "actionUrl" TEXT,
    "actionButtonName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geocode_caches" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geocode_caches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "_CarListingToCarTagOption" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CarListingToCarTagOption_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CarFeatureOptionToCarListing" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CarFeatureOptionToCarListing_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "moderator_profiles_userId_key" ON "moderator_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_profiles_userId_key" ON "dealer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_applications_submissionId_key" ON "dealer_applications"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_applications_editToken_key" ON "dealer_applications"("editToken");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_applications_dealerUserId_key" ON "dealer_applications"("dealerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "car_listings_referenceCode_key" ON "car_listings"("referenceCode");

-- CreateIndex
CREATE UNIQUE INDEX "car_listings_slug_key" ON "car_listings"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "car_listings_vin_key" ON "car_listings"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "car_listings_stripeSessionId_key" ON "car_listings"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "car_listings_stripePaymentIntentId_key" ON "car_listings"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "car_listing_tracking_logs_listingId_deviceId_type_createdAt_idx" ON "car_listing_tracking_logs"("listingId", "deviceId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "car_listing_drafts_listingId_key" ON "car_listing_drafts"("listingId");

-- CreateIndex
CREATE INDEX "car_listing_drafts_dealerUserId_status_idx" ON "car_listing_drafts"("dealerUserId", "status");

-- CreateIndex
CREATE INDEX "car_listing_drafts_batchId_idx" ON "car_listing_drafts"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_staff_staffUserId_key" ON "dealer_staff"("staffUserId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_listingId_userId_key" ON "chat_conversations"("listingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_participants_conversationId_userId_key" ON "chat_participants"("conversationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_userId_listingId_key" ON "wishlists"("userId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "featured_subscriptions_stripeSessionId_key" ON "featured_subscriptions"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "car_feature_options_title_key" ON "car_feature_options"("title");

-- CreateIndex
CREATE UNIQUE INDEX "car_tag_options_title_key" ON "car_tag_options"("title");

-- CreateIndex
CREATE UNIQUE INDEX "car_type_options_title_key" ON "car_type_options"("title");

-- CreateIndex
CREATE UNIQUE INDEX "car_model_options_title_key" ON "car_model_options"("title");

-- CreateIndex
CREATE UNIQUE INDEX "car_brand_options_name_key" ON "car_brand_options"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_subscriptions_stripeSessionId_key" ON "dealer_subscriptions"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_billedToId_idx" ON "invoices"("billedToId");

-- CreateIndex
CREATE INDEX "invoices_type_idx" ON "invoices"("type");

-- CreateIndex
CREATE INDEX "invoices_referenceId_idx" ON "invoices"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "geocode_caches_keyword_key" ON "geocode_caches"("keyword");

-- CreateIndex
CREATE INDEX "_CarListingToCarTagOption_B_index" ON "_CarListingToCarTagOption"("B");

-- CreateIndex
CREATE INDEX "_CarFeatureOptionToCarListing_B_index" ON "_CarFeatureOptionToCarListing"("B");

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderator_profiles" ADD CONSTRAINT "moderator_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderator_profiles" ADD CONSTRAINT "moderator_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_profiles" ADD CONSTRAINT "dealer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_applications" ADD CONSTRAINT "dealer_applications_dealerUserId_fkey" FOREIGN KEY ("dealerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_documents" ADD CONSTRAINT "dealer_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "dealer_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "dealer_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_reviews" ADD CONSTRAINT "application_reviews_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listings" ADD CONSTRAINT "car_listings_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "car_model_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listings" ADD CONSTRAINT "car_listings_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "car_brand_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listings" ADD CONSTRAINT "car_listings_carTypeId_fkey" FOREIGN KEY ("carTypeId") REFERENCES "car_type_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listings" ADD CONSTRAINT "car_listings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listing_tracking_logs" ADD CONSTRAINT "car_listing_tracking_logs_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listing_photos" ADD CONSTRAINT "car_listing_photos_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listing_reviews" ADD CONSTRAINT "car_listing_reviews_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listing_reviews" ADD CONSTRAINT "car_listing_reviews_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listing_drafts" ADD CONSTRAINT "car_listing_drafts_dealerUserId_fkey" FOREIGN KEY ("dealerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listing_drafts" ADD CONSTRAINT "car_listing_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_listing_drafts" ADD CONSTRAINT "car_listing_drafts_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "car_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_staff" ADD CONSTRAINT "dealer_staff_dealerUserId_fkey" FOREIGN KEY ("dealerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_staff" ADD CONSTRAINT "dealer_staff_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_visits" ADD CONSTRAINT "car_visits_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_visits" ADD CONSTRAINT "car_visits_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_visits" ADD CONSTRAINT "car_visits_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_subscriptions" ADD CONSTRAINT "featured_subscriptions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_subscriptions" ADD CONSTRAINT "featured_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "featured_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_subscriptions" ADD CONSTRAINT "featured_subscriptions_addedByAdminId_fkey" FOREIGN KEY ("addedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_subscriptions" ADD CONSTRAINT "featured_subscriptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_subscriptions" ADD CONSTRAINT "dealer_subscriptions_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_subscriptions" ADD CONSTRAINT "dealer_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "dealer_subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_subscriptions" ADD CONSTRAINT "dealer_subscriptions_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billedToId_fkey" FOREIGN KEY ("billedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CarListingToCarTagOption" ADD CONSTRAINT "_CarListingToCarTagOption_A_fkey" FOREIGN KEY ("A") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CarListingToCarTagOption" ADD CONSTRAINT "_CarListingToCarTagOption_B_fkey" FOREIGN KEY ("B") REFERENCES "car_tag_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CarFeatureOptionToCarListing" ADD CONSTRAINT "_CarFeatureOptionToCarListing_A_fkey" FOREIGN KEY ("A") REFERENCES "car_feature_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CarFeatureOptionToCarListing" ADD CONSTRAINT "_CarFeatureOptionToCarListing_B_fkey" FOREIGN KEY ("B") REFERENCES "car_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

