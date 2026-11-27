import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type { AccessTokenClaims, SessionId, UserId } from './types';

/**
 * 访问令牌（HS256 JWT）与刷新令牌的生成/校验。
 * 访问令牌只携带用户与会话标识，短有效期；刷新令牌是不透明字符串，
 * 由 sessionId 与随机 secret 组成，服务端只保存 secret 的哈希。
 */

const JWT_HEADER = { alg: 'HS256', typ: 'JWT' } as const;
const JWT_SEPARATOR = '.';
export const REFRESH_TOKEN_SEPARATOR = '.';
const REFRESH_SECRET_BYTES = 32;

export type AccessTokenFailureReason =
  'malformed' | 'unsupported_algorithm' | 'invalid_signature' | 'expired';

export type AccessTokenVerification =
  { ok: true; claims: AccessTokenClaims } | { ok: false; reason: AccessTokenFailureReason };

export interface CreateAccessTokenOptions {
  userId: UserId;
  sessionId: SessionId;
  ttlSeconds: number;
  now: Date;
}

export function createSessionId(): SessionId {
  return randomUUID();
}

export function createAccessToken(options: CreateAccessTokenOptions, secret: string): string {
  const issuedAt = Math.floor(options.now.getTime() / 1000);
  const claims: AccessTokenClaims = {
    sub: options.userId,
    sid: options.sessionId,
    iat: issuedAt,
    exp: issuedAt + Math.floor(options.ttlSeconds),
  };

  const signingInput = [
    base64UrlEncode(JSON.stringify(JWT_HEADER)),
    base64UrlEncode(JSON.stringify(claims)),
  ].join(JWT_SEPARATOR);

  return `${signingInput}${JWT_SEPARATOR}${sign(signingInput, secret)}`;
}

/** 校验签名与过期时间；不检查会话是否仍然存在（由会话存储负责）。 */
export function verifyAccessToken(
  token: string,
  secret: string,
  now: Date,
): AccessTokenVerification {
  if (typeof token !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  const parts = token.split(JWT_SEPARATOR);
  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  const header = parseBase64UrlJson(encodedHeader);
  if (!header || header['alg'] !== JWT_HEADER.alg) {
    return { ok: false, reason: 'unsupported_algorithm' };
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const payload = parseBase64UrlJson(encodedPayload);
  if (!payload) {
    return { ok: false, reason: 'malformed' };
  }

  const claims = readClaims(payload);
  if (!claims) {
    return { ok: false, reason: 'malformed' };
  }

  if (Math.floor(now.getTime() / 1000) >= claims.exp) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, claims };
}

export interface RefreshTokenParts {
  sessionId: SessionId;
  secret: string;
}

/** 生成刷新令牌：`{sessionId}.{secret}`；令牌本身不落库，只存 secret 哈希。 */
export function createRefreshToken(sessionId: SessionId): string {
  const secret = randomBytes(REFRESH_SECRET_BYTES).toString('base64url');

  return `${sessionId}${REFRESH_TOKEN_SEPARATOR}${secret}`;
}

export function parseRefreshToken(token: unknown): RefreshTokenParts | null {
  if (typeof token !== 'string') {
    return null;
  }

  const index = token.indexOf(REFRESH_TOKEN_SEPARATOR);
  if (index <= 0 || index === token.length - 1) {
    return null;
  }

  const sessionId = token.slice(0, index);
  const secret = token.slice(index + 1);
  if (secret.includes(REFRESH_TOKEN_SEPARATOR)) {
    return null;
  }

  return { sessionId, secret };
}

export function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function isRefreshSecretValid(secret: string, storedHash: string): boolean {
  return safeEqual(hashRefreshSecret(secret), storedHash);
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function parseBase64UrlJson(encoded: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readClaims(payload: Record<string, unknown>): AccessTokenClaims | null {
  const { sub, sid, iat, exp } = payload;
  if (typeof sub !== 'string' || sub.length === 0) {
    return null;
  }
  if (typeof sid !== 'string' || sid.length === 0) {
    return null;
  }
  if (typeof iat !== 'number' || !Number.isFinite(iat)) {
    return null;
  }
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return null;
  }

  return { sub, sid, iat, exp };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
