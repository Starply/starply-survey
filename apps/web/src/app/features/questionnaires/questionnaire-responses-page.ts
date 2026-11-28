import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  QuestionnaireDetailResponse,
  SurveyResponseListResponse,
  SurveyResponseSummary,
} from '@starply/contracts';
import type { TableColumn, TablePageChangeEvent, TableRow } from '@tdesign-ng/components';
import { TButton, TDialog, TTable, TTableCell, TTag } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionnaireService } from '../../core/questionnaire/questionnaire.service';
import { formatDateTime, textFor } from '../../shared/text';
import { QuestionnaireTabs } from './questionnaire-tabs';

/**
 * 原始数据页：分页查看答卷，并弹窗查看单份答案 JSON。
 * 按时间/IP 筛选与导出属于下一阶段，当前先保证可查看与翻页。
 */
@Component({
  selector: 'app-questionnaire-responses-page',
  imports: [RouterLink, QuestionnaireTabs, TButton, TDialog, TTable, TTableCell, TTag],
  templateUrl: './questionnaire-responses-page.html',
  styleUrl: './questionnaire-responses-page.less',
})
export class QuestionnaireResponsesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly questionnaires = inject(QuestionnaireService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly questionnaireId = this.route.snapshot.paramMap.get('questionnaireId') ?? '';
  protected readonly detail = signal<QuestionnaireDetailResponse | null>(null);
  protected readonly items = signal<readonly SurveyResponseSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly selected = signal<SurveyResponseSummary | null>(null);

  protected readonly surveyTitle = computed(() => {
    const content = this.detail()?.draft.content;
    return content ? textFor(content.title, content.defaultLanguage) : '';
  });
  protected readonly status = computed(() => this.detail()?.status ?? 'draft');
  protected readonly tableData = computed<TableRow[]>(() => this.items() as unknown as TableRow[]);
  protected readonly pagination = computed(() => ({
    current: this.page(),
    pageSize: this.pageSize(),
    total: this.total(),
    showPageSize: true,
    showJumper: true,
    pageSizeOptions: [10, 20, 50],
  }));
  protected readonly answersJson = computed(() => {
    const response = this.selected();
    return response ? JSON.stringify(response.answers, null, 2) : '';
  });

  protected readonly columns: TableColumn[] = [
    { colKey: 'index', title: '序号', width: 72, align: 'center' },
    { colKey: 'submittedAt', title: '提交时间', width: 200 },
    { colKey: 'version', title: '版本', width: 90, align: 'center' },
    { colKey: 'language', title: '语言', width: 100 },
    { colKey: 'answerCount', title: '回答题数', width: 110, align: 'center' },
    { colKey: 'actions', title: '操作', width: 120, align: 'right' },
  ];

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [detail, responses] = await Promise.all([
        this.questionnaires.get(this.tenantSlug, this.questionnaireId),
        this.questionnaires.listResponses(
          this.tenantSlug,
          this.questionnaireId,
          this.page(),
          this.pageSize(),
        ),
      ]);
      this.detail.set(detail);
      this.applyResponses(responses);
    } catch (error) {
      this.loadError.set(describeApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected onPageChange(event: TablePageChangeEvent): void {
    this.page.set(event.pageInfo.current);
    this.pageSize.set(event.pageInfo.pageSize);
    void this.load();
  }

  protected indexOf(rowIndex: number): number {
    return (this.page() - 1) * this.pageSize() + rowIndex + 1;
  }

  protected answerCount(row: SurveyResponseSummary): number {
    return Object.keys(row.answers ?? {}).length;
  }

  protected formatTime(value: string): string {
    return formatDateTime(value);
  }

  protected openAnswers(row: SurveyResponseSummary): void {
    this.selected.set(row);
  }

  protected closeAnswers(visible: boolean): void {
    if (!visible) {
      this.selected.set(null);
    }
  }

  private applyResponses(response: SurveyResponseListResponse): void {
    this.items.set(response.items);
    this.total.set(response.total);
    this.page.set(response.page);
    this.pageSize.set(response.pageSize);
  }
}
