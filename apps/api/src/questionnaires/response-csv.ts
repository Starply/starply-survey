import type { AnswerValue, DeepReadonly, LanguageTag, Question } from '@starply/contracts';
import { resolveLocalizedText, type ReadonlySurveyContent } from '@starply/questionnaire-core';

import type { SurveyResponseState } from './questionnaire.repository';

/** 只读题目，与已发布快照结构一致。 */
type CsvQuestion = DeepReadonly<Question>;

const BASE_HEADERS = ['序号', '提交时间', '版本', '语言'] as const;

/**
 * 把答卷导出为 CSV 文本。
 * 题目列顺序取自已发布快照；未发布时只导出基础字段。
 * 结果带 UTF-8 BOM，Excel 打开中文不会乱码。
 */
export function buildResponsesCsv(
  content: ReadonlySurveyContent | null,
  responses: readonly SurveyResponseState[],
): string {
  const language: LanguageTag = content?.defaultLanguage ?? 'zh-CN';
  const questions: readonly CsvQuestion[] = content
    ? content.groups.flatMap((group) => group.questions)
    : [];
  const header = [
    ...BASE_HEADERS,
    ...questions.map(
      (question) => resolveLocalizedText(question.title, language, language) ?? question.id,
    ),
  ];

  const lines = [toCsvRow(header)];
  responses.forEach((response, index) => {
    const row = [
      String(index + 1),
      response.submittedAt.toISOString(),
      String(response.version),
      response.language ?? '',
      ...questions.map((question) =>
        formatAnswer(response.answers[question.id], question, language),
      ),
    ];
    lines.push(toCsvRow(row));
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

function formatAnswer(
  answer: AnswerValue | undefined,
  question: CsvQuestion,
  language: LanguageTag,
): string {
  if (answer === undefined || answer === null) {
    return '';
  }

  if (typeof answer === 'object') {
    return answer.map((value) => formatValue(value, question, language)).join(' / ');
  }

  return formatValue(answer, question, language);
}

/** 选择题把选项值翻译成显示文案，其余题型直接转字符串。 */
function formatValue(value: string | number, question: CsvQuestion, language: LanguageTag): string {
  if (question.type === 'single_choice' || question.type === 'multi_choice') {
    const option = question.config.options.find((item) => (item.value ?? item.id) === value);
    if (option) {
      return resolveLocalizedText(option.label, language, language) ?? String(value);
    }
  }

  return String(value);
}

function toCsvRow(cells: readonly string[]): string {
  return cells.map(escapeCell).join(',');
}

function escapeCell(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
