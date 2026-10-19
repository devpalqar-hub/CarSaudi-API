import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { FirebaseAuthDto } from './dto/firebase-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// ─────────────────────────────────────────────────────────────────────────────
// Response schema examples for Swagger
// ─────────────────────────────────────────────────────────────────────────────

const NEW_USER_RESPONSE = {
  example: {
    isNew: true,
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    token_type: 'Bearer',
  },
};

const EXISTING_USER_RESPONSE = {
  example: {
    isNew: false,
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    token_type: 'Bearer',
    profile: {
      id: 'clxyz123...',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+96612345678',
      role: 'USER',
      authProvider: 'WHATSAPP_OTP',
      isProfileComplete: true,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
};

const COMPLETE_PROFILE_RESPONSE = {
  example: {
    isNew: false,
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    token_type: 'Bearer',
    profile: {
      id: 'clxyz123...',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+96612345678',
      role: 'USER',
      authProvider: 'GOOGLE',
      isProfileComplete: true,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── WhatsApp OTP ────────────────────────────────────────────────────────────

  @Post('otp/send')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send OTP via WhatsApp',
    description:
      'Sends a 6-digit OTP to the provided phone number via WhatsApp. ' +
      'Rate limited: 60-second cooldown between requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        message:
          'OTP sent to WhatsApp number +96612345678. Valid for 5 minutes.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid phone number or cooldown active',
  })
  @ApiResponse({ status: 503, description: 'WhatsApp service unavailable' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify WhatsApp OTP',
    description:
      'Verify the OTP sent to the phone number.\n\n' +
      '**New user** → `{ isNew: true, access_token }` — use token to call `/auth/complete-profile`\n\n' +
      '**Existing user** → `{ isNew: false, access_token, profile }`',
  })
  @ApiResponse({
    status: 200,
    description: 'New user response',
    schema: NEW_USER_RESPONSE,
  })
  @ApiResponse({
    status: 200,
    description: 'Existing user response',
    schema: EXISTING_USER_RESPONSE,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('otp/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login via WhatsApp OTP (alias for /auth/otp/verify)',
    description:
      'Verifies the 6-digit WhatsApp OTP sent to the phone number and logs the user in.\n\n' +
      '**New user** → `{ isNew: true, access_token }` — use token to call `/auth/complete-profile`\n\n' +
      '**Existing user** → `{ isNew: false, access_token, profile }`',
  })
  @ApiResponse({
    status: 200,
    description: 'New user response',
    schema: NEW_USER_RESPONSE,
  })
  @ApiResponse({
    status: 200,
    description: 'Existing user response',
    schema: EXISTING_USER_RESPONSE,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  loginWithOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ── Social Login (Firebase Authentication) ──────────────────────────────────
  // The client signs in via the Firebase Auth SDK (GoogleAuthProvider /
  // OAuthProvider('apple.com')) and sends the resulting Firebase ID token here —
  // not a raw Google/Apple token. The backend verifies it via Firebase Admin.

  @Post('firebase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with any Firebase-linked social provider (recommended)',
    description:
      'Authenticate using a Firebase ID Token obtained after the client signs in via the ' +
      'Firebase Authentication SDK, with any provider (Google, Apple, ...). The provider is ' +
      "auto-detected from the token's `firebase.sign_in_provider` claim, so this one endpoint " +
      'covers `/auth/google` and `/auth/apple` too — prefer this for new integrations.\n\n' +
      '⚠️ For Apple: it only provides name on the VERY FIRST sign-in — pass `firstName`/`lastName` ' +
      'from the native SDK response on first login.\n\n' +
      '**New user** → `{ isNew: true, access_token }` — use token to call `/auth/complete-profile` to add phone\n\n' +
      '**Existing user** → `{ isNew: false, access_token, profile }`',
  })
  @ApiResponse({
    status: 200,
    description: 'New user response',
    schema: NEW_USER_RESPONSE,
  })
  @ApiResponse({
    status: 200,
    description: 'Existing user response',
    schema: EXISTING_USER_RESPONSE,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid/expired token, or unsupported provider',
  })
  firebaseLogin(@Body() dto: FirebaseAuthDto) {
    return this.authService.firebaseLogin(dto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with Google',
    description:
      "Authenticate using a **Firebase ID Token** — the client signs in with Firebase's " +
      'GoogleAuthProvider (not the raw Google Sign-In SDK token) and sends the resulting ' +
      'Firebase ID token here. Equivalent to `POST /auth/firebase`, restricted to the Google ' +
      'provider.\n\n' +
      '**New user** → `{ isNew: true, access_token }` — use token to call `/auth/complete-profile` to add phone\n\n' +
      '**Existing user** → `{ isNew: false, access_token, profile }`',
  })
  @ApiResponse({
    status: 200,
    description: 'New user response',
    schema: NEW_USER_RESPONSE,
  })
  @ApiResponse({
    status: 200,
    description: 'Existing user response',
    schema: EXISTING_USER_RESPONSE,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid/expired token, or not issued via Google sign-in',
  })
  googleLogin(@Body() dto: GoogleAuthDto) {
    return this.authService.googleLogin(dto);
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with Apple',
    description:
      "Authenticate using a **Firebase ID Token** — the client signs in with Firebase's " +
      "OAuthProvider('apple.com') (not the raw Sign in with Apple SDK token) and sends the " +
      'resulting Firebase ID token here. Equivalent to `POST /auth/firebase`, restricted to ' +
      'the Apple provider.\n\n' +
      '⚠️ **Important**: Apple only provides user name and email on the VERY FIRST sign-in. ' +
      'Pass `firstName`, `lastName`, and `email` from the native SDK response on first login.\n\n' +
      '**New user** → `{ isNew: true, access_token }` — use token to call `/auth/complete-profile` to add phone\n\n' +
      '**Existing user** → `{ isNew: false, access_token, profile }`',
  })
  @ApiResponse({
    status: 200,
    description: 'New user response',
    schema: NEW_USER_RESPONSE,
  })
  @ApiResponse({
    status: 200,
    description: 'Existing user response',
    schema: EXISTING_USER_RESPONSE,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid/expired token, or not issued via Apple sign-in',
  })
  appleLogin(@Body() dto: AppleAuthDto) {
    return this.authService.appleLogin(dto);
  }

  // ── Complete Profile ─────────────────────────────────────────────────────────

  @Post('complete-profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete new user profile',
    description:
      'Called after a new user registers via OTP or social login.\n\n' +
      '**OTP users**: Provide `name` (optional) and/or `email` (optional) — phone is already set\n\n' +
      '**Social (Google/Apple) users**: Provide `phone` (recommended) — name and email are pre-filled from provider\n\n' +
      'Returns a fresh JWT with `isProfileComplete: true` in the payload.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile completed — returns fresh token and full profile',
    schema: COMPLETE_PROFILE_RESPONSE,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Phone or email already in use' })
  completeProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: CompleteProfileDto,
  ) {
    return this.authService.completeProfile(userId, dto);
  }

  // ── Email + Password ─────────────────────────────────────────────────────────

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email or phone + password',
    description:
      '**For admin roles only**: SUPER_ADMIN, MODERATOR, DEALER, DEALER_STAFF\n\n' +
      'Regular users (USER role) must use WhatsApp OTP or social login.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        isNew: false,
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        token_type: 'Bearer',
        profile: {
          id: 'clxyz123...',
          name: 'Admin User',
          email: 'admin@carsaudi.com',
          role: 'SUPER_ADMIN',
          isProfileComplete: true,
        },
      },
    },
  })``
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 403,
    description: 'USER role must use OTP or social login',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ── Forgot / Reset Password ──────────────────────────────────────────────────
  // For SUPER_ADMIN, MODERATOR, DEALER and DEALER_STAFF — the email/password login roles.

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset OTP by email',
    description:
      '**For admin roles only**: SUPER_ADMIN, MODERATOR, DEALER, DEALER_STAFF\n\n' +
      'Sends a 6-digit OTP to the account email, valid for 10 minutes. Always returns the same ' +
      'generic message whether or not the email is registered, to prevent account enumeration. ' +
      'Follow up with `POST /auth/reset-password` using the OTP.',
  })
  @ApiResponse({
    status: 200,
    description: 'Generic confirmation message',
    schema: {
      example: {
        message:
          'If an account exists for admin@carsaudi.com, a password reset OTP has been sent.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Resend cooldown active' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using the emailed OTP',
    description:
      '**For admin roles only**: SUPER_ADMIN, MODERATOR, DEALER, DEALER_STAFF\n\n' +
      'Verifies the OTP sent to `email` and sets `password` as the new account password. ' +
      '`confirmPassword` must match `password`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset',
    schema: {
      example: {
        message:
          'Password has been reset successfully. You can now log in with your new password.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid/expired OTP, or password mismatch',
  })
  @ApiResponse({ status: 401, description: 'Invalid email or OTP' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ── Current User ─────────────────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current authenticated user',
    description:
      'Returns the profile attached to the Bearer token in the Authorization header.\n\n' +
      'For SUPER_ADMIN, MODERATOR and DEALER_STAFF, the response also includes a ' +
      '`permissions` array — every `Permission` for SUPER_ADMIN, the granular ' +
      '`Permission[]` assigned to the MODERATOR, or the `DealerStaffPermission[]` ' +
      "granted by the staff member's dealer.",
  })
  @ApiResponse({ status: 200, description: 'Authenticated user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user);
  }
}
