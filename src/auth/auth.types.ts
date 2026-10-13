import { AuthProvider, UserRole } from '@prisma/client';

// ─── Auth Response Types ──────────────────────────────────────────────────────

export interface AuthUserProfile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  authProvider: AuthProvider;
  isProfileComplete: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  isNew?: boolean;
  access_token: string;
  token_type: 'Bearer';
  profile?: AuthUserProfile;
}

// ─── JWT Payload ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  role: string;
  email?: string;
  phone?: string;
  isProfileComplete: boolean;
}
