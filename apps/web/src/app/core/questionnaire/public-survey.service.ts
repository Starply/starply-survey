import { inject, Injectable } from '@angular/core';
import type {
  PublicQuestionnaireResponse,
  SubmitSurveyResponseRequest,
  SubmitSurveyResponseResult,
} from '@starply/contracts';

import { ApiClient } from '../api/api-client';

/**
 * 公开填写接口：无需登录，只访问最新已发布版本。
 * 租户 slug 与问卷 id 都来自公开填写地址。
 */
@Injectable({ providedIn: 'root' })
export class PublicSurveyService {
  private readonly api = inject(ApiClient);

  get(tenantSlug: string, questionnaireId: string): Promise<PublicQuestionnaireResponse> {
    return this.api.get<PublicQuestionnaireResponse>(this.base(tenantSlug, questionnaireId));
  }

  submit(
    tenantSlug: string,
    questionnaireId: string,
    request: SubmitSurveyResponseRequest,
  ): Promise<SubmitSurveyResponseResult> {
    return this.api.post<SubmitSurveyResponseResult>(
      `${this.base(tenantSlug, questionnaireId)}/responses`,
      request,
    );
  }

  private base(tenantSlug: string, questionnaireId: string): string {
    return `/public/t/${encodeURIComponent(tenantSlug)}/questionnaires/${encodeURIComponent(questionnaireId)}`;
  }
}
