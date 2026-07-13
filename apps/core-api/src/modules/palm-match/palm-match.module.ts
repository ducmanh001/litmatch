import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PalmMatchController } from './palm-match.controller';
import { PalmMatchService } from './palm-match.service';
import { PalmReadingTemplate } from './entities/palm-reading-template.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PalmReadingTemplate])],
  controllers: [PalmMatchController],
  providers: [PalmMatchService],
  exports: [], // chưa module nào cần gọi Palm Match
})
export class PalmMatchModule {}
