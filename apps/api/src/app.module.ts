import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { PublicSurveyModule } from './public-survey/public-survey.module';
import { QuestionBankModule } from './question-bank/question-bank.module';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [configuration],
    }),
    DatabaseModule,
    AuthModule,
    QuestionnairesModule,
    QuestionBankModule,
    PublicSurveyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
