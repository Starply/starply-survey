import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type {
  ChoiceOption,
  DeepReadonly,
  LocalizedText,
  PublicQuestionnaireResponse,
  ReadonlySurveyContent,
  SubmitSurveyResponseResult,
  ValidationIssue,
} from '@starply/contracts';
import {
  validateSurveyAnswers,
  type AnswerValue,
  type SurveyAnswers,
} from '@starply/questionnaire-core';
import { TButton, TTag } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { PublicSurveyService } from '../../core/questionnaire/public-survey.service';
import { formatDateTime, textFor } from '../../shared/text';

type GroupView = ReadonlySurveyContent['groups'][number];
type QuestionView = GroupView['questions'][number];
type OptionView = DeepReadonly<ChoiceOption>;

/**
 * 公开填写页。
 * 渲染已发布版本的全部题型；提交前在本地跑一次作答校验，服务端会再次校验并落库。
 * 提交成功后展示回执，不保留任何可被重复提交的状态。
 */
@Component({
  selector: 'app-public-survey-page',
  imports: [TButton, TTag],
  templateUrl: './public-survey-page.html',
  styleUrl: './public-survey-page.less',
})
export class PublicSurveyPage {
  private readonly route = inject(ActivatedRoute);
  private readonly surveys = inject(PublicSurveyService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  protected readonly questionnaireId = this.route.snapshot.paramMap.get('questionnaireId') ?? '';

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly survey = signal<PublicQuestionnaireResponse | null>(null);
  protected readonly answers = signal<SurveyAnswers>({});
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly issues = signal<readonly ValidationIssue[]>([]);
  protected readonly submitted = signal<SubmitSurveyResponseResult | null>(null);

  protected readonly defaultLanguage = computed(
    () => this.survey()?.content.defaultLanguage ?? 'zh-CN',
  );
  protected readonly title = computed(() =>
    textFor(this.survey()?.content.title, this.defaultLanguage()),
  );
  protected readonly description = computed(() =>
    textFor(this.survey()?.content.description, this.defaultLanguage()),
  );
  protected readonly groups = computed(() => this.survey()?.content.groups ?? []);
  protected readonly totalQuestions = computed(() =>
    this.groups().reduce((total, group) => total + group.questions.length, 0),
  );

  private readonly questionById = computed(
    () =>
      new Map(
        this.groups()
          .flatMap((group) => group.questions)
          .map((question) => [question.id, question] as const),
      ),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.survey.set(await this.surveys.get(this.tenantSlug, this.questionnaireId));
    } catch (error) {
      this.loadError.set(describeApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected groupTitle(group: GroupView): string {
    return textFor(group.title, this.defaultLanguage());
  }

  protected groupDescription(group: GroupView): string {
    return textFor(group.description, this.defaultLanguage());
  }

  protected questionTitle(question: QuestionView): string {
    return textFor(question.title, this.defaultLanguage());
  }

  protected questionDescription(question: QuestionView): string {
    return textFor(question.description, this.defaultLanguage());
  }

  protected optionLabel(option: OptionView): string {
    return textFor(option.label, this.defaultLanguage());
  }

  protected optionValue(option: OptionView): string {
    return option.value ?? option.id;
  }

  protected placeholderOf(question: QuestionView): string {
    const config = question.config as { placeholder?: LocalizedText };
    return textFor(config.placeholder, this.defaultLanguage());
  }

  protected textValue(questionId: string): string {
    const value = this.answers()[questionId];
    return typeof value === 'string' ? value : '';
  }

  protected numberText(questionId: string): string {
    const value = this.answers()[questionId];
    return typeof value === 'number' ? String(value) : '';
  }

  protected multiValues(questionId: string): readonly string[] {
    const value = this.answers()[questionId];
    return Array.isArray(value) ? value : [];
  }

  protected isSelected(questionId: string, value: string): boolean {
    const current = this.answers()[questionId];
    if (Array.isArray(current)) {
      return current.includes(value);
    }

    return current === value;
  }

  protected ratingValue(questionId: string): number | null {
    const value = this.answers()[questionId];
    return typeof value === 'number' ? value : null;
  }

  protected ratingValues(config: {
    readonly min?: number;
    readonly max: number;
    readonly step?: number;
  }): number[] {
    const min = config.min ?? 1;
    const step = config.step && config.step > 0 ? config.step : 1;
    const values: number[] = [];
    for (let value = min; value <= config.max; value += step) {
      values.push(value);
    }

    return values;
  }

  protected onTextInput(questionId: string, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.setAnswer(questionId, target.value);
  }

  protected onNumberInput(questionId: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    this.setAnswer(questionId, raw.length === 0 ? '' : Number(raw));
  }

  protected onSingleChange(questionId: string, value: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.setAnswer(questionId, value);
    }
  }

  protected onMultiChange(questionId: string, value: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.multiValues(questionId);
    const next = checked ? [...current, value] : current.filter((item) => item !== value);
    this.setAnswer(questionId, next);
  }

  protected selectRating(questionId: string, value: number): void {
    this.setAnswer(questionId, this.ratingValue(questionId) === value ? '' : value);
  }

  protected issueText(issue: ValidationIssue): string {
    const questionId = readAnswerQuestionId(issue.path);
    const question = questionId ? this.questionById().get(questionId) : undefined;
    const label = question ? this.questionTitle(question) : '问卷';

    return `${label}：${issue.message}`;
  }

  protected async submit(): Promise<void> {
    const survey = this.survey();
    if (!survey || this.submitting()) {
      return;
    }

    const answers = this.answers();
    const validation = validateSurveyAnswers(survey.content, answers);
    this.issues.set(validation.issues);
    this.submitError.set(null);
    if (!validation.valid) {
      return;
    }

    this.submitting.set(true);
    try {
      const result = await this.surveys.submit(this.tenantSlug, this.questionnaireId, {
        answers,
        language: survey.content.defaultLanguage,
      });
      this.submitted.set(result);
    } catch (error) {
      this.submitError.set(describeApiError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  protected restart(): void {
    this.answers.set({});
    this.issues.set([]);
    this.submitError.set(null);
    this.submitted.set(null);
  }

  protected submittedAtText(): string {
    const submitted = this.submitted();
    return submitted ? formatDateTime(submitted.submittedAt) : '';
  }

  /** 空值等同于未作答，直接移除键，保持提交体干净。 */
  private setAnswer(questionId: string, value: AnswerValue | ''): void {
    this.answers.update((current) => {
      const next = { ...current };
      if (value === '' || (Array.isArray(value) && value.length === 0)) {
        delete next[questionId];
      } else {
        next[questionId] = value;
      }

      return next;
    });
    if (this.issues().length > 0) {
      this.issues.set([]);
    }
  }
}

/** 从 `answers["qid"]` 形式的校验路径中取出题目 id。 */
function readAnswerQuestionId(path: string): string | null {
  const match = /^answers\["([^"]+)"\]$/.exec(path);
  return match?.[1] ?? null;
}
