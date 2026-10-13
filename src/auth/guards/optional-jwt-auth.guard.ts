import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT guard — never rejects a request.
 *
 * - If a valid Bearer token is present → validates it and populates req.user.
 * - If no token is present → passes through (req.user stays undefined).
 * - If an invalid / expired token is present → passes through (req.user stays undefined).
 *
 * Use this on endpoints that are public but should also recognise authenticated
 * users (e.g. GET /listings/:id which is public for ACTIVE listings but lets
 * owners, dealer staff, and admins see non-ACTIVE listings).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Never throw — return true whether or not authentication succeeds
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // Override handleRequest so that an auth failure simply returns null
  // (req.user = undefined) instead of throwing UnauthorizedException
  handleRequest(_err: any, user: any) {
    return user ?? null;
  }
}
