import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { QuestionnaireDetailResponse, QuestionnaireStatsResponse } from '@starply/contracts';
import { TButton, TTag } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionnaireService } from '../../core/questionnaire/questionnaire.service';
import { formatDateTime, textFor } from '../../shared/text';
import { QuestionnaireTabs } from './questionnaire-tabs';

/**
 * 数据统计页。
 * 当前先提供收集量、状态与版本概览；按题图表在 ECharts 接入后补充。
 */
@Component({
  selector: 'app-questionnaire-stats-page',
  imports: [RouterLink, QuestionnaireTabs, TButton, TTag],
  templateUrl: './questionnaire-stats-page.html',
  styleUrl: './questionnaire-stats-page.less',
})
export class QuestionnaireStatsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly questionnaires = inject(QuestionnaireService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly questionnaireId = this.route.snapshot.paramMap.get('questionnaireId') ?? '';
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly detail = signal<QuestionnaireDetailResponse | null>(null);
  protected readonly stats = signal<QuestionnaireStatsResponse | null>(null);

  protected readonly surveyTitle = computed(() => {
    const content = this.detail()?.draft.content;
    return content ? textFor(content.title, content.defaultLanguage) : '';
  });
  protected readonly status = computed(() => this.detail()?.status ?? 'draft');
  protected readonly responseCount = computed(() => this.stats()?.responseCount ?? 0);
  protected readonly versionText = computed(() => {
    const version = this.stats()?.publishedVersion;
    return version === null || version === undefined ? '未发布' : `v${version}`;
  });
  protected readonly lastPublishedText = computed(() => {
    const value = this.stats()?.lastPublishedAt;
    return value ? formatDateTime(value) : '—';
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [detail, stats] = await Promise.all([
        this.questionnaires.get(this.tenantSlug, this.questionnaireId),
        this.questionnaires.stats(this.tenantSlug, this.questionnaireId),
      ]);
      this.detail.set(detail);
      this.stats.set(stats);
    } catch (error) {
      this.loadError.set(describeApiError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
