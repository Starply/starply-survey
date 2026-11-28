import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  QuestionBankItemDetailResponse,
  QuestionBankItemListResponse,
} from '@starply/contracts';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { RequireTenantPermission } from '../tenancy/tenant-permission.decorator';
import { TenantContextGuard, type TenantRequest } from '../tenancy/tenant-context.guard';
import { QuestionBankService } from './question-bank.service';

/**
 * 租户题库接口。
 * 读取需要 question_bank:read，写操作需要 question_bank:manage；
 * 路径挂在 `/t/{tenantSlug}` 下，租户归属由 TenantContextGuard 保证。
 */
@Controller('t/:tenantSlug/question-bank-items')
@UseGuards(AccessTokenGuard, TenantContextGuard)
export class QuestionBankController {
  constructor(private readonly questionBank: QuestionBankService) {}

  @Post()
  @RequireTenantPermission('question_bank:manage')
  create(
    @Body() body: unknown,
    @Req() request: TenantRequest,
  ): Promise<QuestionBankItemDetailResponse> {
    return this.questionBank.create(request.tenant!.id, request.auth!.sub, body);
  }

  @Get()
  @RequireTenantPermission('question_bank:read')
  list(@Req() request: TenantRequest): Promise<QuestionBankItemListResponse> {
    return this.questionBank.list(request.tenant!.id);
  }

  @Get(':itemId')
  @RequireTenantPermission('question_bank:read')
  get(
    @Param('itemId') itemId: string,
    @Req() request: TenantRequest,
  ): Promise<QuestionBankItemDetailResponse> {
    return this.questionBank.get(request.tenant!.id, itemId);
  }

  @Put(':itemId')
  @RequireTenantPermission('question_bank:manage')
  update(
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: TenantRequest,
  ): Promise<QuestionBankItemDetailResponse> {
    return this.questionBank.update(request.tenant!.id, itemId, body);
  }

  @Delete(':itemId')
  @RequireTenantPermission('question_bank:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('itemId') itemId: string, @Req() request: TenantRequest): Promise<void> {
    return this.questionBank.delete(request.tenant!.id, itemId);
  }
}
