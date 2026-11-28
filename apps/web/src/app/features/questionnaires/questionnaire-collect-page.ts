import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { QuestionnaireDetailResponse } from '@starply/contracts';
import { TButton, TCard, TMessageService, TQRCode, TTag } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionnaireService } from '../../core/questionnaire/questionnaire.service';
import { publicSurveyUrl } from '../../shared/app-url';
import { textFor } from '../../shared/text';
import { QuestionnaireTabs } from './questionnaire-tabs';

/**
 * 答卷收集页：展示公开填写地址与二维码。
 * 只有已发布问卷可收集；草稿状态给出发布引导，不展示失效链接。
 */
@Component({
  selector: 'app-questionnaire-collect-page',
  imports: [RouterLink, QuestionnaireTabs, TButton, TCard, TQRCode, TTag],
  templateUrl: './questionnaire-collect-page.html',
  styleUrl: './questionnaire-collect-page.less',
})
export class QuestionnaireCollectPage {
  private readonly route = inject(ActivatedRoute);
  private readonly questionnaires = inject(QuestionnaireService);
  private readonly message = inject(TMessageService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly questionnaireId = this.route.snapshot.paramMap.get('questionnaireId') ?? '';
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly detail = signal<QuestionnaireDetailResponse | null>(null);

  protected readonly surveyTitle = computed(() => {
    const content = this.detail()?.draft.content;
    return content ? textFor(content.title, content.defaultLanguage) : '';
  });
  protected readonly published = computed(() => this.detail()?.published ?? null);
  protected readonly status = computed(() => this.detail()?.status ?? 'draft');
  protected readonly fillLink = computed(() =>
    publicSurveyUrl(this.tenantSlug, this.questionnaireId),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.detail.set(await this.questionnaires.get(this.tenantSlug, this.questionnaireId));
    } catch (error) {
      this.loadError.set(describeApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async copyLink(): Promise<void> {
    const link = this.fillLink();
    try {
      await navigator.clipboard.writeText(link);
      this.message.success('答卷链接已复制');
    } catch {
      this.message.warning(`请手动复制答卷链接：${link}`);
    }
  }
}
