import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase.service';

export interface GoogleUserInfo {
  googleId: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Verifies Google sign-in via Firebase Authentication.
 * The client signs in with Firebase's GoogleAuthProvider (mobile/web SDK) and sends the
 * resulting Firebase ID token here — not a raw Google ID token. Firebase Admin verifies the
 * token's signature/expiry/audience against this project, and we additionally check the
 * token was actually issued via the Google provider (`firebase.sign_in_provider`).
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(private readonly firebase: FirebaseService) {}

  async verifyToken(idToken: string): Promise<GoogleUserInfo> {
    try {
      const decoded = await this.firebase.verifyIdToken(idToken);

      if (decoded.firebase?.sign_in_provider !== 'google.com') {
        throw new UnauthorizedException(
          'This token was not issued via Google sign-in',
        );
      }

      this.logger.log(
        `Google (Firebase) token verified for uid: ${decoded.uid}`,
      );

      return {
        googleId: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error('Google token verification failed', error?.message);
      throw new UnauthorizedException(
        'Invalid or expired Google token. Please sign in again.',
      );
    }
  }
}
