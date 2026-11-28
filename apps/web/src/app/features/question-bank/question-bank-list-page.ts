import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  LocalizedText,
  QuestionBankItemSummaryResponse,
  QuestionType,
} from '@starply/contracts';
import type {
  SelectMultipleValue,
  SelectSingleValue,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '@tdesign-ng/components';
import {
  TButton,
  TInput,
  TMessageService,
  TSelect,
  TTable,
  TTableCell,
  TTag,
} from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionBankService } from '../../core/question-bank/question-bank.service';
import { formatDateTime, textFor } from '../../shared/text';
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_OPTIONS } from '../questionnaires/editor-state';

type TypeFilter = 'all' | QuestionType;

/**
 * 题库列表：与问卷列表保持同一套「搜索 + 表格 + 分页」结构，
 * 使用 TDesign Table / Pagination / Select，新建后进入独立编辑页。
 */
@Component({
  selector: 'app-question-bank-list-page',
  imports: [RouterLink, TButton, TInput, TSelect, TTable, TTableCell, TTag],
  templateUrl: './question-bank-list-page.html',
  styleUrl: './question-bank-list-page.less',
})
export class QuestionBankListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly questionBank = inject(QuestionBankService);
  private readonly message = inject(TMessageService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly items = signal<readonly QuestionBankItemSummaryResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly keywordDraft = signal('');
  protected readonly keyword = signal('');
  protected readonly typeDraft = signal<TypeFilter>('all');
  protected readonly type = signal<TypeFilter>('all');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);

  protected readonly typeOptions = [
    { label: '全部题型', value: 'all' },
    ...QUESTION_TYPE_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
  ];

  protected readonly columns: TableColumn[] = [
    { colKey: 'index', title: '序号', width: 72, align: 'center' },
    { colKey: 'title', title: '题目', minWidth: 260 },
    {
      colKey: 'type',
      title: '题型',
      width: 120,
      cell: ({ value }) => QUESTION_TYPE_LABELS[value as QuestionType],
    },
    { colKey: 'tags', title: '标签', minWidth: 180 },
    {
      colKey: 'updatedAt',
      title: '更新时间',
      width: 190,
      cell: ({ row }) => formatDateTime(String(row['updatedAt'])),
    },
    { colKey: 'actions', title: '操作', width: 170, align: 'right' },
  ];

  protected readonly filteredItems = computed(() => {
    const keyword = this.keyword().trim().toLowerCase();
    const type = this.type();

    return this.items().filter((item) => {
      if (type !== 'all' && item.type !== type) {
        return false;
      }
      if (keyword.length === 0) {
        return true;
      }

      const title = textFor(item.title, 'zh-CN').toLowerCase();
      const description = item.description ? textFor(item.description, 'zh-CN').toLowerCase() : '';
      return (
        title.includes(keyword) ||
        description.includes(keyword) ||
        item.tags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  });

  protected readonly tableData = computed<TableRow[]>(
    () => this.filteredItems() as unknown as TableRow[],
  );

  protected readonly pagination = computed(() => ({
    current: this.page(),
    pageSize: this.pageSize(),
    total: this.filteredItems().length,
    showPageSize: true,
    showJumper: true,
    pageSizeOptions: [10, 20, 50],
  }));

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const response = await this.questionBank.list(this.tenantSlug);
      this.items.set(response.items);
    } catch (error) {
      this.loadError.set(describeApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected onKeywordDraftChange(value: string | number): void {
    this.keywordDraft.set(String(value));
  }

  protected onTypeDraftChange(value: SelectSingleValue | SelectMultipleValue): void {
    const next = Array.isArray(value) ? value[0] : value;
    this.typeDraft.set(
      typeof next === 'string' && next in QUESTION_TYPE_LABELS ? (next as QuestionType) : 'all',
    );
  }

  protected applyFilters(): void {
    this.keyword.set(this.keywordDraft());
    this.type.set(this.typeDraft());
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.keywordDraft.set('');
    this.keyword.set('');
    this.typeDraft.set('all');
    this.type.set('all');
    this.page.set(1);
  }

  protected onPageChange(event: TablePageChangeEvent): void {
    this.page.set(event.pageInfo.current);
    this.pageSize.set(event.pageInfo.pageSize);
  }

  protected titleOf(item: QuestionBankItemSummaryResponse): string {
    return textFor(item.title, 'zh-CN');
  }

  /** 题库条目没有默认语言，展示时取第一条可用文案。 */
  protected textOf(text: LocalizedText): string {
    return textFor(text, 'zh-CN');
  }

  protected async remove(item: QuestionBankItemSummaryResponse): Promise<void> {
    if (this.deletingId()) {
      return;
    }

    const title = this.titleOf(item);
    if (!window.confirm(`确定删除题库条目「${title}」？此操作不可恢复。`)) {
      return;
    }

    this.deletingId.set(item.id);
    try {
      await this.questionBank.remove(this.tenantSlug, item.id);
      this.items.update((items) => items.filter((current) => current.id !== item.id));
      this.message.success('题库条目已删除');
    } catch (error) {
      this.message.error(describeApiError(error));
    } finally {
      this.deletingId.set(null);
    }
  }
}
