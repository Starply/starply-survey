import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { QuestionBankItem } from '../database/entities';
import {
  QuestionBankRepository,
  type CreateQuestionBankItemInput,
  type QuestionBankItemState,
  type UpdateQuestionBankItemInput,
} from './question-bank.repository';

/**
 * 基于 TypeORM 的题库仓储。
 * 列表与详情均按 tenantId 过滤，删除同样带租户条件，防止跨租户访问。
 */
@Injectable()
export class TypeormQuestionBankRepository extends QuestionBankRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async list(tenantId: string): Promise<QuestionBankItemState[]> {
    const items = await this.database
      .getDataSource()
      .getRepository(QuestionBankItem)
      .find({
        where: { tenantId },
        order: { updatedAt: 'DESC' },
      });

    return items.map(toState);
  }

  async find(tenantId: string, itemId: string): Promise<QuestionBankItemState | null> {
    const item = await this.database
      .getDataSource()
      .getRepository(QuestionBankItem)
      .findOne({ where: { id: itemId, tenantId } });

    return item ? toState(item) : null;
  }

  async create(input: CreateQuestionBankItemInput): Promise<QuestionBankItemState> {
    const repository = this.database.getDataSource().getRepository(QuestionBankItem);
    const saved = await repository.save(
      repository.create({
        tenantId: input.tenantId,
        type: input.type,
        title: input.title,
        description: input.description,
        config: input.config,
        tags: input.tags,
        createdBy: input.createdBy,
      }),
    );

    return toState(saved);
  }

  async update(
    tenantId: string,
    itemId: string,
    patch: UpdateQuestionBankItemInput,
  ): Promise<QuestionBankItemState | null> {
    const repository = this.database.getDataSource().getRepository(QuestionBankItem);
    const item = await repository.findOne({ where: { id: itemId, tenantId } });
    if (!item) {
      return null;
    }

    if (patch.type !== undefined) {
      item.type = patch.type;
    }
    if (patch.title !== undefined) {
      item.title = patch.title;
    }
    if (patch.description !== undefined) {
      item.description = patch.description;
    }
    if (patch.config !== undefined) {
      item.config = patch.config;
    }
    if (patch.tags !== undefined) {
      item.tags = patch.tags;
    }

    return toState(await repository.save(item));
  }

  async delete(tenantId: string, itemId: string): Promise<boolean> {
    const result = await this.database
      .getDataSource()
      .getRepository(QuestionBankItem)
      .delete({ id: itemId, tenantId });

    return (result.affected ?? 0) > 0;
  }
}

function toState(item: QuestionBankItem): QuestionBankItemState {
  return {
    id: item.id,
    tenantId: item.tenantId,
    type: item.type,
    title: item.title,
    description: item.description,
    config: item.config,
    tags: item.tags ?? [],
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
