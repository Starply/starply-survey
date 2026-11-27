import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  AuthSessionService,
  type IssuedTokens,
  type RefreshFailureReason,
} from '@starply/auth-core';
import type { AuthIdentityResponse, AuthTokensResponse } from '@starply/contracts';

import { AccessTokenGuard, type AuthenticatedRequest } from './access-token.guard';
import { SessionStoreUnavailableError } from './redis-session-store';

const REFRESH_FAILURE_MESSAGES: Record<RefreshFailureReason, string> = {
  invalid_refresh_token: '刷新令牌无效',
  refresh_token_reused: '刷新令牌已失效，请重新登录',
  session_expired: '会话已过期，请重新登录',
  session_idle_timeout: '长时间未操作，请重新登录',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthSessionService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown): Promise<AuthTokensResponse> {
    const { email, password } = readLoginRequest(body);
    const result = await this.callAuth(() => this.auth.login(email, password));

    if (!result.ok) {
      if (result.reason === 'user_disabled') {
        throw new ForbiddenException({
          code: 'user_disabled',
          message: '账号已停用，请联系租户管理员',
        });
      }

      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: '邮箱或密码不正确',
      });
    }

    return toTokensResponse(result.tokens);
  }

  /** 轮换令牌：旧刷新令牌立即失效，重放会撤销整个会话。 */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown): Promise<AuthTokensResponse> {
    const result = await this.callAuth(() => this.auth.refresh(readRefreshToken(body)));

    if (!result.ok) {
      throw new UnauthorizedException({
        code: result.reason,
        message: REFRESH_FAILURE_MESSAGES[result.reason],
      });
    }

    return toTokensResponse(result.tokens);
  }

  /** 删除服务端会话；访问令牌在剩余有效期内仍可用，最长一个 TTL。 */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown): Promise<void> {
    await this.callAuth(() => this.auth.logout(readRefreshToken(body)));
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest): AuthIdentityResponse {
    // 该路由由 AccessTokenGuard 保护，守卫通过后 claims 必然存在。
    const claims = request.auth!;

    return {
      userId: claims.sub,
      sessionId: claims.sid,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    };
  }

  /** Redis 不可用时返回 503，避免把会话存储故障表现成 500。 */
  private async callAuth<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof SessionStoreUnavailableError) {
        throw new ServiceUnavailableException({
          code: 'session_store_unavailable',
          message: '会话存储暂不可用，请稍后重试',
        });
      }

      throw error;
    }
  }
}

function toTokensResponse(tokens: IssuedTokens): AuthTokensResponse {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: 'Bearer',
    expiresIn: tokens.expiresIn,
  };
}

function readLoginRequest(body: unknown): { email: string; password: string } {
  const { email, password } = readBodyRecord(body);
  if (
    typeof email !== 'string' ||
    email.trim().length === 0 ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    throw new BadRequestException({ code: 'invalid_request', message: '需要 email 与 password' });
  }

  return { email, password };
}

function readRefreshToken(body: unknown): string {
  const { refreshToken } = readBodyRecord(body);
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new BadRequestException({ code: 'invalid_request', message: '需要 refreshToken' });
  }

  return refreshToken;
}

function readBodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}
