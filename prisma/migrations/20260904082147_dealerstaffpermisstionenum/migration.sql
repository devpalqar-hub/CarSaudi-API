/*
  Warnings:

  - The values [MANAGE_LISTINGS,MANAGE_CHATS,VIEW_ANALYTICS,MANAGE_STAFF] on the enum `DealerStaffPermission` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DealerStaffPermission_new" AS ENUM ('DASHBOARD_VIEW', 'PROPERTY_LISTINGS_VIEW', 'PROPERTY_DETAILS_VIEW', 'PROPERTY_EDIT', 'PROPERTY_ADD', 'PROPERTY_FEATURE', 'PROPERTY_MARK_SOLD', 'PROPERTY_PAYMENT', 'STAFF_VIEW', 'STAFF_ADD', 'STAFF_EDIT', 'STAFF_DELETE', 'VISIT_INQUIRIES_VIEW', 'BULK_UPLOAD', 'ANALYTICS_VIEW', 'SUBSCRIPTION_VIEW', 'SUBSCRIPTION_PURCHASE', 'SUBSCRIPTION_RENEW', 'INVOICES_VIEW', 'CHATS_MANAGE');
ALTER TABLE "dealer_staff" ALTER COLUMN "permissions" TYPE "DealerStaffPermission_new"[] USING (
  array_replace(
    array_replace(
      array_replace(
        array_replace(
          "permissions"::text[],
          'MANAGE_LISTINGS', 'PROPERTY_LISTINGS_VIEW'
        ),
        'MANAGE_CHATS', 'CHATS_MANAGE'
      ),
      'VIEW_ANALYTICS', 'ANALYTICS_VIEW'
    ),
    'MANAGE_STAFF', 'STAFF_VIEW'
  )::"DealerStaffPermission_new"[]
);
ALTER TYPE "DealerStaffPermission" RENAME TO "DealerStaffPermission_old";
ALTER TYPE "DealerStaffPermission_new" RENAME TO "DealerStaffPermission";
DROP TYPE "public"."DealerStaffPermission_old";
COMMIT;
