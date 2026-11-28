import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  ChoiceOption,
  Question,
  QuestionGroup,
  QuestionnaireDetailResponse,
  QuestionType,
  SurveyContent,
  ValidationIssue,
} from '@starply/contracts';
import { validateSurveyContent } from '@starply/questionnaire-core';
import { TButton, TInput, TMessageService, TTag, TTextarea } from '@tdesign-ng/components';

import { describeApiError, normalizeApiError } from '../../core/api/api-error';
import { QuestionnaireService } from '../../core/questionnaire/questionnaire.service';
import { formatDateTime, setText, textFor } from '../../shared/text';
import {
  addChoiceOption,
  addGroup,
  addQuestion as addQuestionToGroup,
  createQuestion,
  optionsOf as readOptions,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_OPTIONS,
  removeChoiceOption,
  removeGroup,
  removeQuestion,
  setGroupTitle as applyGroupTitle,
  setOptionLabel,
  setQuestionRequired,
  setQuestionTitle,
} from './editor-state';

/**
 * 问卷编辑器。
 * 草稿可保存半成品；发布前先本地跑 schema 校验，再交给服务端做最终校验与版本固化。
 * 服务端返回 permission_denied 时切换为只读提示，不隐藏内容。
 */
@Component({
  selector: 'app-questionnaire-editor-page',
  imports: [RouterLink, TButton, TInput, TTag, TTextarea],
  templateUrl: './questionnaire-editor-page.html',
  styleUrl: './questionnaire-editor-page.less',
})
export class QuestionnaireEditorPage {
  private readonly route = inject(ActivatedRoute);
  private readonly questionnaires = inject(QuestionnaireService);
  private readonly message = inject(TMessageService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly questionnaireId = this.route.snapshot.paramMap.get('questionnaireId') ?? '';

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly detail = signal<QuestionnaireDetailResponse | null>(null);
  protected readonly content = signal<SurveyContent | null>(null);
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly readOnly = signal(false);
  protected readonly issues = signal<readonly ValidationIssue[]>([]);

  protected readonly questionTypeOptions = QUESTION_TYPE_OPTIONS;
  protected readonly status = computed(() => this.detail()?.status ?? 'draft');
  protected readonly defaultLanguage = computed(() => this.content()?.defaultLanguage ?? 'zh-CN');
  protected readonly surveyTitle = computed(() =>
    textFor(this.content()?.title, this.defaultLanguage()),
  );
  protected readonly surveyDescription = computed(() =>
    textFor(this.content()?.description, this.defaultLanguage()),
  );
  protected readonly groups = computed(() => this.content()?.groups ?? []);
  protected readonly published = computed(() => this.detail()?.published ?? null);

  private readonly pendingTypes = signal<Record<string, QuestionType>>({});

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.applyDetail(await this.questionnaires.get(this.tenantSlug, this.questionnaireId));
    } catch (error) {
      this.loadError.set(describeApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected setSurveyTitle(value: string | number): void {
    this.updateContent((content) => ({
      ...content,
      title: setText(content.title, content.defaultLanguage, String(value)),
    }));
  }

  protected setSurveyDescription(value: string | number): void {
    this.updateContent((content) => ({
      ...content,
      description: setText(content.description, content.defaultLanguage, String(value)),
    }));
  }

  protected onAddGroup(): void {
    this.updateContent(addGroup);
  }

  protected onRemoveGroup(groupId: string): void {
    this.updateContent((content) => removeGroup(content, groupId));
  }

  protected onGroupTitleChange(groupId: string, value: string | number): void {
    this.updateContent((content) => applyGroupTitle(content, groupId, String(value)));
  }

  protected onQuestionTitleChange(
    groupId: string,
    questionId: string,
    value: string | number,
  ): void {
    this.updateContent((content) => setQuestionTitle(content, groupId, questionId, String(value)));
  }

  protected onQuestionRequiredChange(groupId: string, questionId: string, event: Event): void {
    const required = (event.target as HTMLInputElement).checked;
    this.updateContent((content) => setQuestionRequired(content, groupId, questionId, required));
  }

  protected onRemoveQuestion(groupId: string, questionId: string): void {
    this.updateContent((content) => removeQuestion(content, groupId, questionId));
  }

  protected onAddOption(groupId: string, questionId: string): void {
    this.updateContent((content) => addChoiceOption(content, groupId, questionId));
  }

  protected onOptionLabelChange(
    groupId: string,
    questionId: string,
    optionId: string,
    value: string | number,
  ): void {
    this.updateContent((content) =>
      setOptionLabel(content, groupId, questionId, optionId, String(value)),
    );
  }

  protected onRemoveOption(groupId: string, questionId: string, optionId: string): void {
    this.updateContent((content) => removeChoiceOption(content, groupId, questionId, optionId));
  }

  protected pendingTypeOf(groupId: string): QuestionType {
    return this.pendingTypes()[groupId] ?? 'text';
  }

  protected onPendingTypeChange(groupId: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as QuestionType;
    this.pendingTypes.update((map) => ({ ...map, [groupId]: value }));
  }

  protected onAddQuestion(groupId: string): void {
    const language = this.content()?.defaultLanguage ?? 'zh-CN';
    const question = createQuestion(this.pendingTypeOf(groupId), language);
    this.updateContent((content) => addQuestionToGroup(content, groupId, question));
  }

  protected optionsOf(question: Question) {
    return readOptions(question);
  }

  protected typeLabel(question: Question): string {
    return QUESTION_TYPE_LABELS[question.type];
  }

  protected groupTitle(group: QuestionGroup): string {
    return textFor(group.title, this.defaultLanguage());
  }

  protected questionTitle(question: Question): string {
    return textFor(question.title, this.defaultLanguage());
  }

  protected optionLabel(option: ChoiceOption): string {
    return textFor(option.label, this.defaultLanguage());
  }

  protected ratingMax(question: Question): number {
    return question.type === 'rating' ? question.config.max : 0;
  }

  protected publishedAtText(): string {
    const published = this.published();
    return published ? `${formatDateTime(published.publishedAt)}（v${published.version}）` : '';
  }

  /** 公开填写地址：只有已发布版本可被访问，复制按钮在未发布时禁用。 */
  protected fillLink(): string {
    return `${window.location.origin}/t/${this.tenantSlug}/s/${this.questionnaireId}`;
  }

  protected async copyFillLink(): Promise<void> {
    if (!this.published()) {
      return;
    }

    const link = this.fillLink();
    try {
      await navigator.clipboard.writeText(link);
      this.message.success('填写链接已复制');
    } catch {
      this.message.warning(`请手动复制填写链接：${link}`);
    }
  }

  protected async saveDraft(): Promise<boolean> {
    const content = this.content();
    if (!content || this.saving()) {
      return false;
    }

    this.saving.set(true);
    try {
      const updated = await this.questionnaires.updateDraft(
        this.tenantSlug,
        this.questionnaireId,
        content,
      );
      this.applyDetail(updated);
      this.message.success('草稿已保存');
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected async publish(): Promise<void> {
    if (this.publishing() || this.readOnly()) {
      return;
    }

    const content = this.content();
    if (!content) {
      return;
    }

    const validation = validateSurveyContent(content);
    this.issues.set(validation.issues);
    if (!validation.valid) {
      this.message.warning('问卷内容未通过校验，请先修正');
      return;
    }

    this.publishing.set(true);
    try {
      if (this.dirty() && !(await this.saveDraft())) {
        return;
      }

      const latest = this.content();
      if (!latest) {
        return;
      }
      const published = await this.questionnaires.publish(this.tenantSlug, this.questionnaireId);
      this.detail.update((detail) =>
        detail
          ? { ...detail, status: 'published', published: { ...published, content: latest } }
          : detail,
      );
      this.issues.set([]);
      this.message.success(`已发布 v${published.version}`);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.publishing.set(false);
    }
  }

  private updateContent(mapper: (content: SurveyContent) => SurveyContent): void {
    this.content.update((content) => (content ? mapper(content) : content));
    this.dirty.set(true);
  }

  private applyDetail(detail: QuestionnaireDetailResponse): void {
    this.detail.set(detail);
    this.content.set(structuredClone(detail.draft.content));
    this.dirty.set(false);
  }

  private handleError(error: unknown): void {
    const normalized = normalizeApiError(error);
    if (normalized.code === 'permission_denied') {
      this.readOnly.set(true);
    }
    if (Array.isArray(normalized.details)) {
      this.issues.set(normalized.details as ValidationIssue[]);
    }
    this.message.error(describeApiError(error));
  }
}
