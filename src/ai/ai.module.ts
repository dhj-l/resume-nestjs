import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { TtsService } from './tts.service';

@Module({
  controllers: [AiController],
  providers: [AiService, TtsService],
  exports: [AiService, TtsService],
})
export class AiModule {}
