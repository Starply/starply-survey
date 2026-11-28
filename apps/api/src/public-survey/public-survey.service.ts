import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PublicQuestionnaireResponse, SubmitSurveyResponseResult } from '@starply/contracts';
import {
  isValidLanguageTag,
  validateSurveyAnswers,
  type SurveyAnswers,
} from '@starply/questionnaire-core';

import {
  SurveyResponseRepository,
  type PublicQuestionnaireFailure,
  type PublishedQuestionnaireSnapshot,
} from './survey-response.repository';

/**
 * 公开填写服务：无需登录，只暴露最新已发布版本。
 * 提交前用发布快照做一次作答校验，保证落库数据满足问卷约束。
 */
@Injectable()
export class PublicSurveyService {
  constructor(private readonly repository: SurveyResponseRepository) {}

  async getPublished(
    tenantSlug: string,
    questionnaireId: string,
  ): Promise<PublicQuestionnaireResponse> {
    const snapshot = await this.loadPublished(tenantSlug, questionnaireId);

    return {
      questionnaireId: snapshot.questionnaireId,
      tenantSlug: snapshot.tenantSlug,
      slug: snapshot.slug,
      version: snapshot.version,
      schemaVersion: snapshot.schemaVersion,
      publishedAt: snapshot.publishedAt.toISOString(),
      content: snapshot.content,
    };
  }

  async submit(
    tenantSlug: string,
    questionnaireId: string,
    body: unknown,
  ): Promise<SubmitSurveyResponseResult> {
    const request = readSubmitRequest(body);
    const snapshot = await this.loadPublished(tenantSlug, questionnaireId);

    const validation = validateSurveyAnswers(snapshot.content, request.answers);
    if (!validation.valid) {
      throw new BadRequestException({
        code: 'answers_invalid',
        message: '回答未通过校验，请检查后重试',
        details: validation.errors,
      });
    }

    const record = await this.repository.create({
      tenantId: snapshot.tenantId,
      questionnaireId: snapshot.questionnaireId,
      questionnaireVersionId: snapshot.questionnaireVersionId,
      version: snapshot.version,
      language: request.language,
      answers: request.answers,
    });

    return { responseId: record.id, submittedAt: record.submittedAt.toISOString() };
  }

  private async loadPublished(
    tenantSlug: string,
    questionnaireId: string,
  ): Promise<PublishedQuestionnaireSnapshot> {
    const lookup = await this.repository.findPublishedQuestionnaire(tenantSlug, questionnaireId);
    if (!lookup.ok) {
      throw lookupFailure(lookup.reason);
    }

    return lookup.snapshot;
  }
}

function lookupFailure(reason: PublicQuestionnaireFailure): Error {
  switch (reason) {
    case 'tenant_not_found':
      return new NotFoundException({ code: 'tenant_not_found', message: '租户不存在' });
    case 'tenant_inactive':
      return new ForbiddenException({ code: 'tenant_inactive', message: '租户已停用' });
    case 'not_published':
      return new NotFoundException({
        code: 'questionnaire_not_published',
        message: '问卷不存在或尚未发布',
      });
  }
}

interface SubmitRequest {
  answers: SurveyAnswers;
  language: string | null;
}

function readSubmitRequest(body: unknown): SubmitRequest {
  const record = readObject(body);
  const answers = record['answers'];
  if (!isRecord(answers)) {
    throw new BadRequestException({
      code: 'invalid_request',
      message: '需要以题目 id 为键的 answers 对象',
    });
  }

  const language = record['language'];
  if (language !== undefined && language !== null && !isValidLanguageTag(language)) {
    throw new BadRequestException({
      code: 'invalid_request',
      message: 'language 必须是合法语言键，如 zh-CN',
    });
  }

  return {
    answers: answers as SurveyAnswers,
    language: typeof language === 'string' ? language : null,
  };
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException({ code: 'invalid_request', message: '请求体必须是对象' });
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
