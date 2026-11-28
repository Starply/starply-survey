import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { PublicQuestionnaireResponse, SubmitSurveyResponseResult } from '@starply/contracts';

import { PublicSurveyService } from './public-survey.service';

/**
 * 公开填写接口，无需登录。
 * 只暴露最新已发布版本；不存在、未发布或租户不可用时分别返回 404/403。
 */
@Controller('public/t/:tenantSlug/questionnaires/:questionnaireId')
export class PublicSurveyController {
  constructor(private readonly surveys: PublicSurveyService) {}

  @Get()
  get(
    @Param('tenantSlug') tenantSlug: string,
    @Param('questionnaireId') questionnaireId: string,
  ): Promise<PublicQuestionnaireResponse> {
    return this.surveys.getPublished(tenantSlug, questionnaireId);
  }

  @Post('responses')
  submit(
    @Param('tenantSlug') tenantSlug: string,
    @Param('questionnaireId') questionnaireId: string,
    @Body() body: unknown,
  ): Promise<SubmitSurveyResponseResult> {
    return this.surveys.submit(tenantSlug, questionnaireId, body);
  }
}
