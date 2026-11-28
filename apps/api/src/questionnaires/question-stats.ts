import type { AnswerDistributionBucket, QuestionStatsResponse } from '@starply/contracts';
import type {
  AnswerValue,
  DeepReadonly,
  Question,
  ReadonlySurveyContent,
  SurveyAnswers,
} from '@starply/questionnaire-core';

type ReadonlyQuestion = DeepReadonly<Question>;
type ReadonlyChoiceQuestion = Extract<ReadonlyQuestion, { type: 'single_choice' | 'multi_choice' }>;

/**
 * 按已发布问卷的题目结构，聚合全部答卷得到题目统计。
 * 只使用发布快照，避免草稿修改影响历史统计口径。
 */
export function buildQuestionStats(
  content: ReadonlySurveyContent | null,
  responses: readonly SurveyAnswers[],
): QuestionStatsResponse[] {
  if (!content) {
    return [];
  }

  return content.groups.flatMap((group) =>
    group.questions.map((question) =>
      buildQuestionStat(question, responses, content.defaultLanguage),
    ),
  );
}

function buildQuestionStat(
  question: ReadonlyQuestion,
  responses: readonly SurveyAnswers[],
  language: string,
): QuestionStatsResponse {
  const answeredCount = responses.filter((answers) => hasAnswer(answers[question.id])).length;

  return {
    questionId: question.id,
    title: question.title,
    type: question.type,
    answeredCount,
    buckets: buildBuckets(question, responses, language),
  };
}

function buildBuckets(
  question: ReadonlyQuestion,
  responses: readonly SurveyAnswers[],
  language: string,
): AnswerDistributionBucket[] {
  if (question.type === 'single_choice' || question.type === 'multi_choice') {
    return buildChoiceBuckets(question, responses);
  }

  if (question.type === 'rating') {
    return buildRatingBuckets(question.config.max, responses, question.id, language);
  }

  return [];
}

function buildChoiceBuckets(
  question: ReadonlyChoiceQuestion,
  responses: readonly SurveyAnswers[],
): AnswerDistributionBucket[] {
  const options = question.config.options;
  const counts = new Map<string, number>(options.map((option) => [choiceValue(option), 0]));

  for (const answers of responses) {
    const value = answers[question.id];
    if (Array.isArray(value)) {
      for (const item of value) {
        increment(counts, String(item));
      }
    } else if (value !== undefined && value !== null) {
      increment(counts, String(value));
    }
  }

  return options.map((option) => ({
    value: choiceValue(option),
    label: option.label,
    count: counts.get(choiceValue(option)) ?? 0,
  }));
}

function buildRatingBuckets(
  max: number,
  responses: readonly SurveyAnswers[],
  questionId: string,
  language: string,
): AnswerDistributionBucket[] {
  const counts = new Map<number, number>();

  for (const answers of responses) {
    const value = answers[questionId];
    const rating = typeof value === 'number' ? value : Number(value);
    if (Number.isInteger(rating) && rating >= 1 && rating <= max) {
      counts.set(rating, (counts.get(rating) ?? 0) + 1);
    }
  }

  return Array.from({ length: max }, (_, index) => {
    const rating = index + 1;
    return {
      value: String(rating),
      label: { [language]: String(rating) },
      count: counts.get(rating) ?? 0,
    };
  });
}

function choiceValue(option: { id: string; value?: string }): string {
  return option.value ?? option.id;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function hasAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return String(value).length > 0;
}
