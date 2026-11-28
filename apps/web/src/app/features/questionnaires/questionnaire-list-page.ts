import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { QuestionnaireStatus, QuestionnaireSummaryResponse } from '@starply/contracts';
import { isValidLanguageTag } from '@starply/questionnaire-core';
import { checkTenantSlug } from '@starply/tenancy-core';
import type {
  SelectMultipleValue,
  SelectSingleValue,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '@tdesign-ng/components';
import {
  TButton,
  TCard,
  TDialog,
  TInput,
  TMessageService,
  TPopconfirm,
  TSelect,
  TTable,
  TTableCell,
  TTag,
} from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionnaireService } from '../../core/questionnaire/questionnaire.service';
import { publicSurveyUrl } from '../../shared/app-url';
import { formatDateTime, textFor } from '../../shared/text';

type StatusFilter = 'all' | QuestionnaireStatus;

/**
 * 租户问卷列表：参考调问网的「搜索 + 列表 + 分页」结构，整体保持顶部菜单、下方内容的上下布局。
 * 列表使用 TDesign Table / Pagination / Dialog，新建问卷在对话框完成，编辑进入独立编辑器。
 */
@Component({
  selector: 'app-questionnaire-list-page',
  imports: [
    RouterLink,
    TButton,
    TCard,
    TDialog,
    TInput,
    TPopconfirm,
    TSelect,
    TTable,
    TTableCell,
    TTag,
  ],
  templateUrl: './questionnaire-list-page.html',
  styleUrl: './questionnaire-list-page.less',
})
export class QuestionnaireListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly questionnaires = inject(QuestionnaireService);
  private readonly message = inject(TMessageService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly items = signal<readonly QuestionnaireSummaryResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  // 搜索条件：草稿值在点击「查询」后才生效，重置会同时清空输入。
  protected readonly keywordDraft = signal('');
  protected readonly keyword = signal('');
  protected readonly statusDraft = signal<StatusFilter>('all');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);

  protected readonly statusOptions = [
    { label: '全部状态', value: 'all' },
    { label: '草稿', value: 'draft' },
    { label: '已发布', value: 'published' },
  ];

  protected readonly columns: TableColumn[] = [
    { colKey: 'index', title: '序号', width: 72, align: 'center' },
    { colKey: 'title', title: '问卷', minWidth: 300 },
    { colKey: 'responses', title: '答卷数', width: 90, align: 'center' },
    { colKey: 'status', title: '状态', width: 130 },
    {
      colKey: 'createdAt',
      title: '创建时间',
      width: 180,
      cell: ({ row }) => formatDateTime(String(row['createdAt'])),
    },
    { colKey: 'actions', title: '操作', width: 220, align: 'right' },
  ];

  protected readonly filteredItems = computed(() => {
    const keyword = this.keyword().trim().toLowerCase();
    const status = this.status();

    return this.items().filter((item) => {
      if (status !== 'all' && item.status !== status) {
        return false;
      }
      if (keyword.length === 0) {
        return true;
      }

      const title = textFor(item.title, item.defaultLanguage).toLowerCase();
      return title.includes(keyword) || item.slug.toLowerCase().includes(keyword);
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

  protected readonly showCreate = signal(false);
  protected readonly creating = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly newSlug = signal('');
  protected readonly newTitle = signal('');
  protected readonly newLanguage = signal('zh-CN');
  protected readonly newDescription = signal('');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const response = await this.questionnaires.list(this.tenantSlug);
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

  protected onStatusDraftChange(value: SelectSingleValue | SelectMultipleValue): void {
    const next = Array.isArray(value) ? value[0] : value;
    this.statusDraft.set(next === 'draft' || next === 'published' ? next : 'all');
  }

  protected applyFilters(): void {
    this.keyword.set(this.keywordDraft());
    this.status.set(this.statusDraft());
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.keywordDraft.set('');
    this.keyword.set('');
    this.statusDraft.set('all');
    this.status.set('all');
    this.page.set(1);
  }

  protected onPageChange(event: TablePageChangeEvent): void {
    this.page.set(event.pageInfo.current);
    this.pageSize.set(event.pageInfo.pageSize);
  }

  protected titleOf(item: QuestionnaireSummaryResponse): string {
    return textFor(item.title, item.defaultLanguage) || item.slug;
  }

  protected statusText(status: unknown): string {
    return status === 'published' ? '已发布' : '草稿';
  }

  protected updatedAtText(item: QuestionnaireSummaryResponse): string {
    return formatDateTime(item.updatedAt);
  }

  /** 公开填写地址只对已发布问卷有效；hash 路由下必须带 `#`。 */
  protected fillLink(item: QuestionnaireSummaryResponse): string {
    return publicSurveyUrl(this.tenantSlug, item.id);
  }

  protected async copyFillLink(item: QuestionnaireSummaryResponse): Promise<void> {
    const link = this.fillLink(item);
    try {
      await navigator.clipboard.writeText(link);
      this.message.success('填写链接已复制');
    } catch {
      this.message.warning(`请手动复制填写链接：${link}`);
    }
  }

  protected deleteConfirmText(item: QuestionnaireSummaryResponse): string {
    return `确定删除问卷「${this.titleOf(item)}」？已发布版本与回答将一并删除，且不可恢复。`;
  }

  protected async confirmDelete(item: QuestionnaireSummaryResponse): Promise<void> {
    if (this.deletingId()) {
      return;
    }

    this.deletingId.set(item.id);
    try {
      await this.questionnaires.remove(this.tenantSlug, item.id);
      this.items.update((items) => items.filter((current) => current.id !== item.id));
      this.message.success('问卷已删除');
    } catch (error) {
      this.message.error(describeApiError(error));
    } finally {
      this.deletingId.set(null);
    }
  }

  protected openCreate(): void {
    this.newSlug.set('');
    this.newTitle.set('');
    this.newLanguage.set('zh-CN');
    this.newDescription.set('');
    this.formError.set(null);
    this.showCreate.set(true);
  }

  protected onCreateVisibleChange(visible: boolean): void {
    if (!visible && this.creating()) {
      return;
    }
    this.showCreate.set(visible);
    if (!visible) {
      this.formError.set(null);
    }
  }

  protected onSlugChange(value: string | number): void {
    this.newSlug.set(String(value));
  }

  protected onTitleChange(value: string | number): void {
    this.newTitle.set(String(value));
  }

  protected onLanguageChange(value: string | number): void {
    this.newLanguage.set(String(value));
  }

  protected onDescriptionChange(value: string | number): void {
    this.newDescription.set(String(value));
  }

  protected async create(): Promise<void> {
    if (this.creating()) {
      return;
    }

    this.formError.set(null);
    const slug = checkTenantSlug(this.newSlug());
    if (!slug.ok) {
      this.formError.set('问卷标识需为 3-63 位小写字母、数字或连字符');
      return;
    }
    const language = this.newLanguage().trim();
    if (!isValidLanguageTag(language)) {
      this.formError.set('默认语言需为合法语言键，如 zh-CN');
      return;
    }
    const title = this.newTitle().trim();
    if (title.length === 0) {
      this.formError.set('请输入问卷标题');
      return;
    }

    this.creating.set(true);
    try {
      const description = this.newDescription().trim();
      const created = await this.questionnaires.create(this.tenantSlug, {
        slug: slug.slug,
        defaultLanguage: language,
        title: { [language]: title },
        ...(description.length > 0 ? { description: { [language]: description } } : {}),
      });
      this.showCreate.set(false);
      this.message.success('问卷已创建');
      await this.router.navigate(['/t', this.tenantSlug, 'questionnaires', created.id]);
    } catch (error) {
      this.formError.set(describeApiError(error));
    } finally {
      this.creating.set(false);
    }
  }
}
