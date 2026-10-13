import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TrackingJobData, TrackingService } from './tracking.service';
import { Logger } from '@nestjs/common';

@Processor('tracking')
export class TrackingProcessor extends WorkerHost {
  private readonly logger = new Logger(TrackingProcessor.name);

  constructor(private readonly trackingService: TrackingService) {
    super();
  }

  async process(job: Job<TrackingJobData>): Promise<any> {
    try {
      const result = await this.trackingService.processTrackingJob(job.data);
      return result;
    } catch (error) {
      this.logger.error(`Error processing tracking job: ${error.message}`);
      throw error;
    }
  }
}
