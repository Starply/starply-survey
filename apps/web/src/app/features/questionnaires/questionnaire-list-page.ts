import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { QuestionnaireSummaryResponse } from '@starply/contracts';
import { isValidLanguageTag } from '@starply/questionnaire-core';
import { checkTenantSlug } from '@starply/tenancy-core';
import { TButton, TInput, TTag } from '@tdesign-ng/components';
import { TMessageService } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionnaireService } from '../../core/questionnaire/questionnaire.service';
import { formatDateTime, textFor } from '../../shared/text';

/**
 * 租户问卷列表。
 * 列表来自租户级接口，展示标题、状态与最近更新时间；新建后直接进入编辑器。
 */
@Component({
  selector: 'app-questionnaire-list-page',
  imports: [RouterLink, TButton, TInput, TTag],
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

  protected titleOf(item: QuestionnaireSummaryResponse): string {
    return textFor(item.title, item.defaultLanguage) || item.slug;
  }

  protected updatedAtOf(item: QuestionnaireSummaryResponse): string {
    return formatDateTime(item.updatedAt);
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
      this.message.success('问卷已创建');
      await this.router.navigate(['/t', this.tenantSlug, 'questionnaires', created.id]);
    } catch (error) {
      this.formError.set(describeApiError(error));
    } finally {
      this.creating.set(false);
    }
  }
}
