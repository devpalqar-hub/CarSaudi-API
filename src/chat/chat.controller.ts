import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { GetMessagesDto } from './dto/get-messages.dto';

@ApiTags('Chat')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Image upload
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Step 1 of image messaging:
   *   Client calls this endpoint to upload the image → gets a MinIO URL.
   *   Step 2: Client sends a WebSocket `send_message` with type=IMAGE and the URL.
   */
  @Post('upload')
  @ApiOperation({
    summary: 'Upload a chat image to MinIO (returns presigned URL)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.chatService.uploadChatImage(file, req.user.id);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Conversation listing
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns all conversations the authenticated user participates in,
   * with a last-message preview and listing details.
   * Works for USERS, DEALERS, and DEALER_STAFF.
   */
  @Get('conversations')
  @ApiOperation({
    summary: 'List all conversations for the authenticated user',
  })
  async getConversations(@Request() req: any) {
    return this.chatService.getConversations(req.user.id);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Message history
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns paginated message history for a specific conversation.
   * The caller must be a participant; otherwise 403 is returned.
   */
  @Get('conversations/:id/messages')
  @ApiOperation({
    summary: 'Get paginated message history for a conversation',
  })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async getMessages(
    @Param('id') conversationId: string,
    @Query() query: GetMessagesDto,
    @Request() req: any,
  ) {
    return this.chatService.getMessageHistory(
      conversationId,
      req.user.id,
      query.page,
      query.limit,
    );
  }
}
