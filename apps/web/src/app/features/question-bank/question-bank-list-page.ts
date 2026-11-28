import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { LocalizedText, QuestionBankItemSummaryResponse } from '@starply/contracts';
import { TButton, TMessageService, TTag } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionBankService } from '../../core/question-bank/question-bank.service';
import { formatDateTime, textFor } from '../../shared/text';
import { QUESTION_TYPE_LABELS } from '../questionnaires/editor-state';

/**
 * 题库列表：常规表格 + 新建/编辑/删除。
 * 题库条目是可复用的题目模板，不参与问卷发布校验。
 */
@Component({
  selector: 'app-question-bank-list-page',
  imports: [RouterLink, TButton, TTag],
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

  protected typeLabel(item: QuestionBankItemSummaryResponse): string {
    return QUESTION_TYPE_LABELS[item.type];
  }

  protected titleOf(item: QuestionBankItemSummaryResponse): string {
    return textFor(item.title, 'zh-CN');
  }

  /** 题库条目没有默认语言，展示时取第一条可用文案。 */
  protected textOf(text: LocalizedText): string {
    return textFor(text, 'zh-CN');
  }

  protected updatedAtOf(item: QuestionBankItemSummaryResponse): string {
    return formatDateTime(item.updatedAt);
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
