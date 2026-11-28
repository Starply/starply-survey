/**
 * 应用使用 hash 路由，站内绝对地址必须带 `#`。
 * 用 document.baseURI 而不是 origin，兼容部署在子路径下的场景。
 */
export function absoluteAppUrl(path: string): string {
  const base = document.baseURI.replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;

  return `${base}/#${normalized}`;
}

/** 公开填写地址；只有已发布问卷才应展示。 */
export function publicSurveyUrl(tenantSlug: string, questionnaireId: string): string {
  return absoluteAppUrl(
    `/t/${encodeURIComponent(tenantSlug)}/s/${encodeURIComponent(questionnaireId)}`,
  );
}
