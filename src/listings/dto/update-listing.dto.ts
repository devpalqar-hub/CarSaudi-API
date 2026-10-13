import { PartialType } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto';

/**
 * All fields from CreateListingDto are optional on update.
 * The service layer enforces business rules:
 *   - Owners editing REJECTED listings → status resets to RESUBMITTED
 *   - Only admins can set contactVerified = true
 */
export class UpdateListingDto extends PartialType(CreateListingDto) {}
