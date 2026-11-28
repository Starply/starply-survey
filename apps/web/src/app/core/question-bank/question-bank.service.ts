import { inject, Injectable } from '@angular/core';
import type {
  CreateQuestionBankItemRequest,
  QuestionBankItemDetailResponse,
  QuestionBankItemListResponse,
  UpdateQuestionBankItemRequest,
} from '@starply/contracts';

import { ApiClient } from '../api/api-client';

/**
 * 租户题库接口。
 * 与问卷接口一致，租户 slug 由调用方从路由传入，服务层不持有全局租户状态。
 */
@Injectable({ providedIn: 'root' })
export class QuestionBankService {
  private readonly api = inject(ApiClient);

  list(tenantSlug: string): Promise<QuestionBankItemListResponse> {
    return this.api.get<QuestionBankItemListResponse>(this.base(tenantSlug));
  }

  get(tenantSlug: string, itemId: string): Promise<QuestionBankItemDetailResponse> {
    return this.api.get<QuestionBankItemDetailResponse>(
      `${this.base(tenantSlug)}/${encodeURIComponent(itemId)}`,
    );
  }

  create(
    tenantSlug: string,
    request: CreateQuestionBankItemRequest,
  ): Promise<QuestionBankItemDetailResponse> {
    return this.api.post<QuestionBankItemDetailResponse>(this.base(tenantSlug), request);
  }

  update(
    tenantSlug: string,
    itemId: string,
    request: UpdateQuestionBankItemRequest,
  ): Promise<QuestionBankItemDetailResponse> {
    return this.api.put<QuestionBankItemDetailResponse>(
      `${this.base(tenantSlug)}/${encodeURIComponent(itemId)}`,
      request,
    );
  }

  async remove(tenantSlug: string, itemId: string): Promise<void> {
    await this.api.delete(`${this.base(tenantSlug)}/${encodeURIComponent(itemId)}`);
  }

  private base(tenantSlug: string): string {
    return `/t/${encodeURIComponent(tenantSlug)}/question-bank-items`;
  }
}
