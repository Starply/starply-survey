import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  AnswerValue,
  DeepReadonly,
  LanguageTag,
  Question,
  QuestionnaireDetailResponse,
  SurveyResponseListResponse,
  SurveyResponseSummary,
} from '@starply/contracts';
import type { TableColumn, TablePageChangeEvent, TableRow } from '@tdesign-ng/components';
import {
  TButton,
  TCard,
  TDialog,
  TMessageService,
  TTable,
  TTableCell,
  TTag,
} from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionnaireService } from '../../core/questionnaire/questionnaire.service';
import { formatDateTime, textFor } from '../../shared/text';
import { QuestionnaireTabs } from './questionnaire-tabs';

/**
 * 原始数据页：分页查看答卷，支持导出 CSV 与按题查看单份答案。
 * 按时间/IP 筛选属于下一阶段，当前先保证可查看、翻页与导出。
 */
@Component({
  selector: 'app-questionnaire-responses-page',
  imports: [RouterLink, QuestionnaireTabs, TButton, TCard, TDialog, TTable, TTableCell, TTag],
  templateUrl: './questionnaire-responses-page.html',
  styleUrl: './questionnaire-responses-page.less',
})
export class QuestionnaireResponsesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly questionnaires = inject(QuestionnaireService);
  private readonly message = inject(TMessageService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly questionnaireId = this.route.snapshot.paramMap.get('questionnaireId') ?? '';
  protected readonly detail = signal<QuestionnaireDetailResponse | null>(null);
  protected readonly items = signal<readonly SurveyResponseSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly exporting = signal(false);
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
  /** 把当前答卷按已发布题目展开为「题目标题 + 作答内容」。 */
  protected readonly answerRows = computed(() => {
    const response = this.selected();
    const content = this.detail()?.published?.content ?? this.detail()?.draft.content ?? null;
    if (!response || !content) {
      return [];
    }

    const language = content.defaultLanguage;
    return content.groups
      .flatMap((group) => group.questions)
      .map((question) => ({
        id: question.id,
        title: textFor(question.title, language) || question.id,
        value: formatAnswerText(response.answers[question.id], question, language),
      }))
      .filter((row) => row.value !== '');
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

  /** 下载全部答卷 CSV；成功与失败都用全局消息提示，避免遮住表格。 */
  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const csv = await this.questionnaires.exportResponsesCsv(
        this.tenantSlug,
        this.questionnaireId,
      );
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.tenantSlug}-responses.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.message.success('已导出 CSV');
    } catch (error) {
      this.message.error(describeApiError(error));
    } finally {
      this.exporting.set(false);
    }
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

/** 单题作答转可读文本；选择题把选项值翻译成显示文案。 */
function formatAnswerText(
  answer: AnswerValue | undefined,
  question: DeepReadonly<Question>,
  language: LanguageTag,
): string {
  if (answer === undefined || answer === null) {
    return '';
  }

  if (typeof answer === 'object') {
    return answer.map((value) => formatAnswerValue(value, question, language)).join('、');
  }

  return formatAnswerValue(answer, question, language);
}

function formatAnswerValue(
  value: string | number,
  question: DeepReadonly<Question>,
  language: LanguageTag,
): string {
  if (question.type === 'single_choice' || question.type === 'multi_choice') {
    const option = question.config.options.find((item) => (item.value ?? item.id) === value);
    if (option) {
      return textFor(option.label, language) || String(value);
    }
  }

  return String(value);
}
