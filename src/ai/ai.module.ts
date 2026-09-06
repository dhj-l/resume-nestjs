import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { TtsService } from './tts.service';
import { SttService } from './stt.service';

@Module({
  controllers: [AiController],
  providers: [AiService, TtsService, SttService],
  exports: [AiService, TtsService, SttService],
})
export class AiModule {}
