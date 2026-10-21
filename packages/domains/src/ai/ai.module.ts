import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCostController } from './ai-cost.controller';
import { AiService } from './ai.service';
import { AiRequest } from '@htveridoc/db/ai/entities/ai-request.entity';
import { GeminiProvider } from './providers/gemini.provider';
import { AI_PROVIDER } from './types/ai.types';

@Module({
  imports: [TypeOrmModule.forFeature([AiRequest])],
  controllers: [AiCostController],
  providers: [
    GeminiProvider,
    {
      provide: AI_PROVIDER,
      useExisting: GeminiProvider,
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
