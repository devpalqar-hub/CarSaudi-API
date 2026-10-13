import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import * as crypto from 'crypto';

export const DeviceId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const xDeviceId = request.headers['x-device-id'];

    if (xDeviceId) {
      return xDeviceId as string;
    }

    // Fallback to IP + User-Agent hash
    const ip = request.ip || request.connection.remoteAddress || 'unknown-ip';
    const userAgent = request.headers['user-agent'] || 'unknown-ua';

    return crypto
      .createHash('sha256')
      .update(`${ip}-${userAgent}`)
      .digest('hex');
  },
);
