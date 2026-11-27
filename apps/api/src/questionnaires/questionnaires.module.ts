import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { QuestionnaireController } from './questionnaire.controller';
import { QuestionnaireRepository } from './questionnaire.repository';
import { QuestionnaireService } from './questionnaire.service';
import { TypeormQuestionnaireRepository } from './typeorm-questionnaire.repository';

@Module({
  imports: [AuthModule, TenancyModule],
  controllers: [QuestionnaireController],
  providers: [
    QuestionnaireService,
    { provide: QuestionnaireRepository, useClass: TypeormQuestionnaireRepository },
  ],
})
export class QuestionnairesModule {}
