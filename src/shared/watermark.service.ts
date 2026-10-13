import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { resolveAssetPath } from './asset-path.util';

const WATERMARK_PATH = resolveAssetPath('logo.png');

// Watermark sized relative to the uploaded image, bounded so it stays
// legible on both tiny thumbnails and large photos.
const WATERMARK_WIDTH_RATIO = 0.25;
const WATERMARK_MIN_WIDTH = 80;
const WATERMARK_MAX_WIDTH = 400;
const WATERMARK_PADDING = 20;
const WATERMARK_OPACITY = 0.7;

@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);

  /**
   * Stamps logo.png onto the bottom-right corner of an image at 70% opacity,
   * used for uploads made without authentication. Falls back to the original
   * buffer (never throws) so a watermarking failure can't block an upload.
   */
  async applyWatermark(image: Buffer): Promise<Buffer> {
    try {
      const base = sharp(image);
      const { width, height } = await base.metadata();
      if (!width || !height) return image;

      const watermarkWidth = Math.round(
        Math.min(
          WATERMARK_MAX_WIDTH,
          Math.max(WATERMARK_MIN_WIDTH, width * WATERMARK_WIDTH_RATIO),
        ),
      );

      const { data, info } = await sharp(WATERMARK_PATH)
        .resize({ width: watermarkWidth })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Scale down the alpha channel to apply the target opacity.
      for (let i = 3; i < data.length; i += info.channels) {
        data[i] = Math.round(data[i] * WATERMARK_OPACITY);
      }

      const transparentWatermark = await sharp(data, {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels,
        },
      })
        .png()
        .toBuffer();

      const left = Math.max(0, width - info.width - WATERMARK_PADDING);
      const top = Math.max(0, height - info.height - WATERMARK_PADDING);

      return await base
        .composite([{ input: transparentWatermark, left, top }])
        .toBuffer();
    } catch (err) {
      this.logger.warn(`Failed to apply watermark: ${(err as Error).message}`);
      return image;
    }
  }
}
