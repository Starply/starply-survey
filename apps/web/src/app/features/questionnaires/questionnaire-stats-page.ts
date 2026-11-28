import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  LanguageTag,
  QuestionnaireDetailResponse,
  QuestionnaireStatsResponse,
  QuestionStatsResponse,
} from '@starply/contracts';
import type { EChartsOption } from 'echarts';
import { TButton, TCard, TEmpty, TTag } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionnaireService } from '../../core/questionnaire/questionnaire.service';
import { EChart } from '../../shared/chart/echart';
import { formatDateTime, textFor } from '../../shared/text';
import { QUESTION_TYPE_LABELS } from './editor-state';
import { QuestionnaireTabs } from './questionnaire-tabs';

/**
 * 数据统计页。
 * 概览卡展示收集量、状态与版本；已发布问卷按题型用 ECharts 展示作答分布。
 */
@Component({
  selector: 'app-questionnaire-stats-page',
  imports: [RouterLink, QuestionnaireTabs, EChart, TButton, TCard, TEmpty, TTag],
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
  protected readonly language = computed<LanguageTag>(
    () => this.detail()?.draft.content.defaultLanguage ?? 'zh-CN',
  );
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
  protected readonly questionStats = computed(() => {
    const language = this.language();
    return (this.stats()?.questions ?? []).map((question) => ({
      ...question,
      option: buildChartOption(question, language),
    }));
  });
  protected readonly emptyDescription = computed(() =>
    this.responseCount() === 0
      ? '还没有答卷数据。发布问卷并收集到回答后，这里会展示各题型的统计图表。'
      : '当前没有可统计的已发布题目。',
  );

  constructor() {
    void this.load();
  }

  protected titleOf(question: QuestionStatsResponse): string {
    return textFor(question.title, this.language());
  }

  protected typeLabel(question: QuestionStatsResponse): string {
    return QUESTION_TYPE_LABELS[question.type];
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

/**
 * 选择题用横向条形图，评分题用纵向柱状图。
 * 没有可聚合选项的题型返回 null，由页面展示纯文本说明。
 */
function buildChartOption(
  question: QuestionStatsResponse,
  language: LanguageTag,
): EChartsOption | null {
  if (question.buckets.length === 0) {
    return null;
  }

  const labels = question.buckets.map((bucket) => textFor(bucket.label, language) || bucket.value);
  const data = question.buckets.map((bucket) => bucket.count);
  const tooltip = { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } };

  if (question.type === 'rating') {
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip,
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data,
          barMaxWidth: 32,
          itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }

  return {
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip,
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: {
      type: 'category',
      data: labels,
      axisLabel: { width: 160, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data,
        barMaxWidth: 24,
        itemStyle: { color: '#0052d9', borderRadius: [0, 4, 4, 0] },
      },
    ],
  };
}
