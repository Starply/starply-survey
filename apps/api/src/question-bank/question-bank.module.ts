import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { QuestionBankController } from './question-bank.controller';
import { QuestionBankRepository } from './question-bank.repository';
import { QuestionBankService } from './question-bank.service';
import { TypeormQuestionBankRepository } from './typeorm-question-bank.repository';

@Module({
  imports: [AuthModule, TenancyModule],
  controllers: [QuestionBankController],
  providers: [
    QuestionBankService,
    { provide: QuestionBankRepository, useClass: TypeormQuestionBankRepository },
  ],
})
export class QuestionBankModule {}
