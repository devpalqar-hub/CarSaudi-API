import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Extra key/value data delivered alongside the notification (e.g. deep-link route, entity IDs) */
  data?: Record<string, string>;
}

/**
 * Thin wrapper around the Firebase Admin SDK for sending push notifications (FCM).
 * Lazily initialises the Admin app from service-account env vars — if they're not
 * configured, all send calls are no-ops (logged, never throw), so the rest of the
 * app keeps working in environments without Firebase set up (e.g. local dev).
 */
@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;
  private initAttempted = false;

  constructor(private readonly configService: ConfigService) {}

  private getApp(): App | null {
    if (this.initAttempted) return this.app;
    this.initAttempted = true;

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    // Private keys stored in .env usually have literal "\n" — convert back to real newlines
    const privateKey = this.configService
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase credentials not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / ' +
          'FIREBASE_PRIVATE_KEY). Push notifications will be logged only, not sent.',
      );
      return null;
    }

    try {
      const existing = getApps();
      this.app = existing.length
        ? existing[0]
        : initializeApp({
            credential: cert({ projectId, clientEmail, privateKey }),
          });
      return this.app;
    } catch (err: any) {
      this.logger.error(
        `Failed to initialise Firebase Admin SDK: ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * Verifies a Firebase ID token (issued after the client signs in via Firebase Authentication,
   * with any provider — Google, Apple, email/password, phone, etc.) and returns its decoded
   * claims (`uid`, `email`, `name`, `picture`, `firebase.sign_in_provider`, ...).
   * Throws if Firebase isn't configured or the token is invalid/expired — auth callers should
   * always surface this as a clear failure, never silently continue.
   */
  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    const app = this.getApp();
    if (!app) {
      throw new Error(
        'Firebase is not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)',
      );
    }
    return getAuth(app).verifyIdToken(idToken);
  }

  /**
   * Sends the same notification to one or more device tokens (typically a single user's devices).
   * Never throws — logs and swallows errors so a failed push never breaks the calling feature
   * (e.g. sending a chat message). Returns which tokens turned out to be invalid so callers can
   * prune them from storage.
   */
  async sendToTokens(
    tokens: string[],
    payload: PushNotificationPayload,
  ): Promise<{ successCount: number; invalidTokens: string[] }> {
    const app = this.getApp();
    if (!app || tokens.length === 0)
      return { successCount: 0, invalidTokens: [] };

    try {
      const response = await getMessaging(app).sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      });

      const invalidTokens: string[] = [];
      response.responses.forEach((r, i) => {
        if (
          !r.success &&
          (r.error?.code === 'messaging/registration-token-not-registered' ||
            r.error?.code === 'messaging/invalid-registration-token')
        ) {
          invalidTokens.push(tokens[i]);
        }
      });

      return { successCount: response.successCount, invalidTokens };
    } catch (err: any) {
      this.logger.warn(
        `FCM multicast send failed (non-critical): ${err?.message}`,
      );
      return { successCount: 0, invalidTokens: [] };
    }
  }
}
