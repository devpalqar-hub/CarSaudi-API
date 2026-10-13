-- The moderator Permission enum is being replaced with a fully-granular set (dashboard,
-- properties, dealers, featured, subscriptions, users, options, banners, support) that
-- mirrors the admin panel's permission model. None of the old values map cleanly onto the
-- new ones, so existing moderators' `permissions` are reset to empty and must be re-granted
-- from the admin panel. This does not affect SUPER_ADMIN, which bypasses permission checks
-- entirely, or DealerStaffPermission, which is untouched.
BEGIN;

CREATE TYPE "Permission_new" AS ENUM (
    'DASHBOARD_VIEW',
    'PROPERTIES_VIEW',
    'PROPERTIES_MANAGE',
    'PROPERTIES_REVIEW',
    'PROPERTY_ANALYTICS_VIEW',
    'DEALERS_VIEW',
    'DEALERS_MANAGE',
    'DEALERS_APPLICATIONS_REVIEW',
    'DEALER_ANALYTICS_VIEW',
    'FEATURED_PLANS_VIEW',
    'FEATURED_PLANS_MANAGE',
    'FEATURED_PROPERTIES_VIEW',
    'SUBSCRIPTION_PLANS_VIEW',
    'SUBSCRIPTION_PLANS_MANAGE',
    'DEALER_SUBSCRIPTIONS_VIEW',
    'USERS_VIEW',
    'OPTIONS_VIEW',
    'OPTIONS_MANAGE',
    'BANNERS_VIEW',
    'BANNERS_MANAGE',
    'SUPPORT_VIEW',
    'SUPPORT_REPLY',
    'SUPPORT_UPDATE_STATUS'
);

ALTER TABLE "moderator_profiles"
  ALTER COLUMN "permissions" TYPE "Permission_new"[] USING (ARRAY[]::"Permission_new"[]);

DROP TYPE "Permission";
ALTER TYPE "Permission_new" RENAME TO "Permission";

COMMIT;
