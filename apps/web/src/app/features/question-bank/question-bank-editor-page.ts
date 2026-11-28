import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  ChoiceOption,
  CreateQuestionBankItemRequest,
  LocalizedText,
  QuestionBankItemConfig,
  QuestionType,
  UpdateQuestionBankItemRequest,
} from '@starply/contracts';
import { TButton, TInput, TMessageService, TTextarea } from '@tdesign-ng/components';

import { describeApiError } from '../../core/api/api-error';
import { QuestionBankService } from '../../core/question-bank/question-bank.service';
import { setText, textFor } from '../../shared/text';
import {
  createId,
  createQuestion,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_OPTIONS,
} from '../questionnaires/editor-state';

/** 题库条目没有默认语言，编辑时统一写入中文文案，其余语言原样保留。 */
const EDIT_LANGUAGE = 'zh-CN';

/**
 * 题库条目编辑器：新建与编辑共用。
 * 题型、标题、描述、标签与题型专属配置（选项/评分范围/数字范围）都在此维护；
 * 选择题与评分题提供默认配置，保存前只做最小结构校验。
 */
@Component({
  selector: 'app-question-bank-editor-page',
  imports: [RouterLink, TButton, TInput, TTextarea],
  templateUrl: './question-bank-editor-page.html',
  styleUrl: './question-bank-editor-page.less',
})
export class QuestionBankEditorPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly questionBank = inject(QuestionBankService);
  private readonly message = inject(TMessageService);

  protected readonly tenantSlug = this.route.snapshot.paramMap.get('tenantSlug') ?? '';
  private readonly itemId = this.route.snapshot.paramMap.get('itemId');
  protected readonly isNew = this.itemId === null;

  protected readonly loading = signal(!this.isNew);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly type = signal<QuestionType>('text');
  protected readonly titleText = signal('');
  protected readonly descriptionText = signal('');
  protected readonly tagsInput = signal('');
  protected readonly options = signal<readonly ChoiceOption[]>([]);
  protected readonly ratingMaxText = signal('5');
  protected readonly numberMinText = signal('');
  protected readonly numberMaxText = signal('');

  protected readonly questionTypeOptions = QUESTION_TYPE_OPTIONS;
  protected readonly heading = computed(() => (this.isNew ? '新建题目' : '编辑题目'));

  protected typeLabel(): string {
    return QUESTION_TYPE_LABELS[this.type()];
  }

  private titleSource = signal<LocalizedText | null>(null);
  private descriptionSource = signal<LocalizedText | null>(null);

  constructor() {
    if (this.itemId) {
      void this.load(this.itemId);
    }
  }

  protected async load(itemId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const detail = await this.questionBank.get(this.tenantSlug, itemId);
      this.type.set(detail.type);
      this.titleSource.set(detail.title);
      this.titleText.set(textFor(detail.title, EDIT_LANGUAGE));
      this.descriptionSource.set(detail.description);
      this.descriptionText.set(
        detail.description ? textFor(detail.description, EDIT_LANGUAGE) : '',
      );
      this.tagsInput.set(detail.tags.join(', '));
      this.applyConfig(detail.type, detail.config);
    } catch (error) {
      this.loadError.set(describeApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected onTypeChange(event: Event): void {
    const type = (event.target as HTMLSelectElement).value as QuestionType;
    this.type.set(type);
    this.applyConfig(type, createQuestion(type, EDIT_LANGUAGE).config);
    if (this.titleText().trim().length === 0) {
      this.titleText.set(QUESTION_TYPE_LABELS[type]);
    }
  }

  protected onTitleChange(value: string | number): void {
    this.titleText.set(String(value));
  }

  protected onDescriptionChange(value: string | number): void {
    this.descriptionText.set(String(value));
  }

  protected onTagsChange(value: string | number): void {
    this.tagsInput.set(String(value));
  }

  protected onRatingMaxChange(value: string | number): void {
    this.ratingMaxText.set(String(value));
  }

  protected onNumberMinChange(value: string | number): void {
    this.numberMinText.set(String(value));
  }

  protected onNumberMaxChange(value: string | number): void {
    this.numberMaxText.set(String(value));
  }

  protected isChoiceType(): boolean {
    const type = this.type();
    return type === 'single_choice' || type === 'multi_choice';
  }

  protected optionLabel(option: ChoiceOption): string {
    return textFor(option.label, EDIT_LANGUAGE);
  }

  protected onOptionLabelChange(optionId: string, value: string | number): void {
    this.options.update((options) =>
      options.map((option) =>
        option.id === optionId
          ? { ...option, label: setText(option.label, EDIT_LANGUAGE, String(value)) }
          : option,
      ),
    );
  }

  protected addOption(): void {
    this.options.update((options) => [
      ...options,
      { id: createId('o'), label: { [EDIT_LANGUAGE]: `选项 ${options.length + 1}` } },
    ]);
  }

  protected removeOption(optionId: string): void {
    this.options.update((options) => options.filter((option) => option.id !== optionId));
  }

  protected cancel(): void {
    void this.router.navigate(['/t', this.tenantSlug, 'question-bank']);
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.formError.set(null);
    const titleText = this.titleText().trim();
    if (titleText.length === 0) {
      this.formError.set('请输入题目标题');
      return;
    }

    if (this.isChoiceType() && this.options().length === 0) {
      this.formError.set('选择题至少需要一个选项');
      return;
    }

    const ratingMax = Number(this.ratingMaxText().trim());
    if (
      this.type() === 'rating' &&
      (!Number.isInteger(ratingMax) || ratingMax < 2 || ratingMax > 10)
    ) {
      this.formError.set('评分最高分需为 2-10 的整数');
      return;
    }

    const min = parseOptionalNumber(this.numberMinText());
    const max = parseOptionalNumber(this.numberMaxText());
    if (
      this.type() === 'number' &&
      ((min !== undefined && Number.isNaN(min)) || (max !== undefined && Number.isNaN(max)))
    ) {
      this.formError.set('数字范围需为有效数字');
      return;
    }
    if (this.type() === 'number' && min !== undefined && max !== undefined && min > max) {
      this.formError.set('数字最小值不能大于最大值');
      return;
    }

    const description = this.descriptionText().trim();
    const title = setText(this.titleSource() ?? undefined, EDIT_LANGUAGE, titleText);
    const descriptionText =
      description.length > 0
        ? setText(this.descriptionSource() ?? undefined, EDIT_LANGUAGE, description)
        : null;
    const common = {
      type: this.type(),
      title,
      config: this.buildConfig(),
      tags: parseTags(this.tagsInput()),
    };

    this.saving.set(true);
    try {
      if (this.itemId) {
        const request: UpdateQuestionBankItemRequest = {
          ...common,
          description: descriptionText,
        };
        await this.questionBank.update(this.tenantSlug, this.itemId, request);
        this.message.success('题库条目已更新');
      } else {
        const request: CreateQuestionBankItemRequest = {
          ...common,
          ...(descriptionText ? { description: descriptionText } : {}),
        };
        await this.questionBank.create(this.tenantSlug, request);
        this.message.success('题库条目已创建');
      }
      this.cancel();
    } catch (error) {
      this.formError.set(describeApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private applyConfig(type: QuestionType, config: QuestionBankItemConfig): void {
    if (type === 'single_choice' || type === 'multi_choice') {
      const options = readOptions(config);
      this.options.set(options.length > 0 ? options : defaultOptions());
    } else {
      this.options.set([]);
    }

    if (type === 'rating') {
      this.ratingMaxText.set(String(readNumber(config, 'max') ?? 5));
    }

    if (type === 'number') {
      this.numberMinText.set(formatOptionalNumber(readNumber(config, 'min')));
      this.numberMaxText.set(formatOptionalNumber(readNumber(config, 'max')));
    }
  }

  private buildConfig(): QuestionBankItemConfig {
    const type = this.type();
    if (type === 'single_choice' || type === 'multi_choice') {
      return { options: [...this.options()] };
    }
    if (type === 'rating') {
      return { min: 1, max: Number(this.ratingMaxText().trim()) };
    }
    if (type === 'number') {
      const min = parseOptionalNumber(this.numberMinText());
      const max = parseOptionalNumber(this.numberMaxText());

      return {
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      };
    }

    return {};
  }
}

function readOptions(config: QuestionBankItemConfig): readonly ChoiceOption[] {
  const options = (config as unknown as { options?: unknown }).options;

  return Array.isArray(options) ? (options as ChoiceOption[]) : [];
}

function readNumber(config: QuestionBankItemConfig, key: 'min' | 'max'): number | undefined {
  const value = (config as unknown as Record<string, unknown>)[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function defaultOptions(): ChoiceOption[] {
  return [{ id: createId('o'), label: { [EDIT_LANGUAGE]: '选项 1' } }];
}

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return Number(trimmed);
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** 支持英文/中文逗号与换行，去空并去重。 */
function parseTags(raw: string): string[] {
  const tags = raw
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return [...new Set(tags)];
}
