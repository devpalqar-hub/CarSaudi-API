import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase.service';

export interface AppleUserInfo {
  appleId: string;
  email?: string;
}

/**
 * Verifies Apple sign-in via Firebase Authentication.
 * The client signs in with Firebase's OAuthProvider('apple.com') (mobile/web SDK) and sends
 * the resulting Firebase ID token here — not a raw Apple identity token. Firebase Admin
 * verifies the token's signature/expiry/audience against this project, and we additionally
 * check the token was actually issued via the Apple provider (`firebase.sign_in_provider`).
 *
 * NOTE: Apple only provides name/email to Firebase on the VERY FIRST sign-in.
 * The client must still forward these from the native SDK response (see AppleAuthDto).
 */
@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);

  constructor(private readonly firebase: FirebaseService) {}

  async verifyToken(idToken: string): Promise<AppleUserInfo> {
    try {
      const decoded = await this.firebase.verifyIdToken(idToken);

      if (decoded.firebase?.sign_in_provider !== 'apple.com') {
        throw new UnauthorizedException(
          'This token was not issued via Apple sign-in',
        );
      }

      this.logger.log(
        `Apple (Firebase) token verified for uid: ${decoded.uid}`,
      );

      return {
        appleId: decoded.uid,
        email: decoded.email,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error('Apple token verification failed', error?.message);
      throw new UnauthorizedException(
        'Invalid or expired Apple token. Please sign in again.',
      );
    }
  }
}
