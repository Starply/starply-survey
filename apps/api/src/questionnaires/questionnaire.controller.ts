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
  PublishQuestionnaireResponse,
  QuestionnaireDetailResponse,
  QuestionnaireListResponse,
} from '@starply/contracts';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { RequireTenantPermission } from '../tenancy/tenant-permission.decorator';
import { TenantContextGuard, type TenantRequest } from '../tenancy/tenant-context.guard';
import { QuestionnaireService } from './questionnaire.service';

/**
 * 租户管理端问卷接口。
 * 路由统一挂在 `/t/{tenantSlug}` 下；TenantContextGuard 已保证 request.auth 与 request.tenant 存在，
 * 并按方法上的权限声明校验角色（创建/编辑/发布分别对应 survey:create/update/publish）。
 */
@Controller('t/:tenantSlug/questionnaires')
@UseGuards(AccessTokenGuard, TenantContextGuard)
export class QuestionnaireController {
  constructor(private readonly questionnaires: QuestionnaireService) {}

  @Post()
  @RequireTenantPermission('survey:create')
  create(
    @Body() body: unknown,
    @Req() request: TenantRequest,
  ): Promise<QuestionnaireDetailResponse> {
    return this.questionnaires.create(request.tenant!.id, request.auth!.sub, body);
  }

  /** 租户级全量列表；仅返回概览字段，标题取当前草稿。 */
  @Get()
  @RequireTenantPermission('survey:read')
  list(@Req() request: TenantRequest): Promise<QuestionnaireListResponse> {
    return this.questionnaires.list(request.tenant!.id);
  }

  @Get(':questionnaireId')
  @RequireTenantPermission('survey:read')
  get(
    @Param('questionnaireId') questionnaireId: string,
    @Req() request: TenantRequest,
  ): Promise<QuestionnaireDetailResponse> {
    return this.questionnaires.get(request.tenant!.id, questionnaireId);
  }

  /** 覆盖保存草稿；已发布版本不受影响。 */
  @Put(':questionnaireId/draft')
  @RequireTenantPermission('survey:update')
  updateDraft(
    @Param('questionnaireId') questionnaireId: string,
    @Body() body: unknown,
    @Req() request: TenantRequest,
  ): Promise<QuestionnaireDetailResponse> {
    return this.questionnaires.updateDraft(request.tenant!.id, questionnaireId, body);
  }

  /** 发布当前草稿，返回新版本元信息；内容非法时返回 400 与校验问题列表。 */
  @Post(':questionnaireId/publish')
  @RequireTenantPermission('survey:publish')
  publish(
    @Param('questionnaireId') questionnaireId: string,
    @Req() request: TenantRequest,
  ): Promise<PublishQuestionnaireResponse> {
    return this.questionnaires.publish(request.tenant!.id, questionnaireId);
  }

  /** 删除问卷，版本与回答级联删除；成功返回 204。 */
  @Delete(':questionnaireId')
  @RequireTenantPermission('survey:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('questionnaireId') questionnaireId: string,
    @Req() request: TenantRequest,
  ): Promise<void> {
    return this.questionnaires.delete(request.tenant!.id, questionnaireId);
  }
}
