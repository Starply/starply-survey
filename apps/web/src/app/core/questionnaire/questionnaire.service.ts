import { inject, Injectable } from '@angular/core';
import type {
  CreateQuestionnaireRequest,
  PublishQuestionnaireResponse,
  QuestionnaireDetailResponse,
  QuestionnaireListResponse,
  QuestionnaireStatsResponse,
  SurveyContent,
  SurveyResponseListResponse,
  UpdateQuestionnaireDraftRequest,
} from '@starply/contracts';

import { ApiClient } from '../api/api-client';

/**
 * 租户问卷接口。
 * 租户 slug 由调用方从路由传入，服务层不持有全局租户状态，便于多标签页共存。
 */
@Injectable({ providedIn: 'root' })
export class QuestionnaireService {
  private readonly api = inject(ApiClient);

  list(tenantSlug: string): Promise<QuestionnaireListResponse> {
    return this.api.get<QuestionnaireListResponse>(this.base(tenantSlug));
  }

  get(tenantSlug: string, questionnaireId: string): Promise<QuestionnaireDetailResponse> {
    return this.api.get<QuestionnaireDetailResponse>(
      `${this.base(tenantSlug)}/${encodeURIComponent(questionnaireId)}`,
    );
  }

  stats(tenantSlug: string, questionnaireId: string): Promise<QuestionnaireStatsResponse> {
    return this.api.get<QuestionnaireStatsResponse>(
      `${this.base(tenantSlug)}/${encodeURIComponent(questionnaireId)}/stats`,
    );
  }

  listResponses(
    tenantSlug: string,
    questionnaireId: string,
    page: number,
    pageSize: number,
  ): Promise<SurveyResponseListResponse> {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    return this.api.get<SurveyResponseListResponse>(
      `${this.base(tenantSlug)}/${encodeURIComponent(questionnaireId)}/responses?${query.toString()}`,
    );
  }

  create(
    tenantSlug: string,
    request: CreateQuestionnaireRequest,
  ): Promise<QuestionnaireDetailResponse> {
    return this.api.post<QuestionnaireDetailResponse>(this.base(tenantSlug), request);
  }

  updateDraft(
    tenantSlug: string,
    questionnaireId: string,
    content: SurveyContent,
  ): Promise<QuestionnaireDetailResponse> {
    const request: UpdateQuestionnaireDraftRequest = { content };

    return this.api.put<QuestionnaireDetailResponse>(
      `${this.base(tenantSlug)}/${encodeURIComponent(questionnaireId)}/draft`,
      request,
    );
  }

  publish(tenantSlug: string, questionnaireId: string): Promise<PublishQuestionnaireResponse> {
    return this.api.post<PublishQuestionnaireResponse>(
      `${this.base(tenantSlug)}/${encodeURIComponent(questionnaireId)}/publish`,
      {},
    );
  }

  async remove(tenantSlug: string, questionnaireId: string): Promise<void> {
    await this.api.delete(`${this.base(tenantSlug)}/${encodeURIComponent(questionnaireId)}`);
  }

  private base(tenantSlug: string): string {
    return `/t/${encodeURIComponent(tenantSlug)}/questionnaires`;
  }
}
