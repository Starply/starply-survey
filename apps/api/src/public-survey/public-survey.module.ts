import { Module } from '@nestjs/common';

import { PublicSurveyController } from './public-survey.controller';
import { PublicSurveyService } from './public-survey.service';
import { SurveyResponseRepository } from './survey-response.repository';
import { TypeormSurveyResponseRepository } from './typeorm-survey-response.repository';

@Module({
  controllers: [PublicSurveyController],
  providers: [
    PublicSurveyService,
    { provide: SurveyResponseRepository, useClass: TypeormSurveyResponseRepository },
  ],
})
export class PublicSurveyModule {}
