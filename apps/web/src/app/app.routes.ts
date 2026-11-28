import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { tenantSlugGuard } from './core/tenant/tenant-slug.guard';
import { LoginPage } from './features/auth/login-page';
import { PublicSurveyPage } from './features/public-survey/public-survey-page';
import { QuestionnaireEditorPage } from './features/questionnaires/questionnaire-editor-page';
import { QuestionnaireListPage } from './features/questionnaires/questionnaire-list-page';
import { TenantShell } from './features/tenant/tenant-shell';

/**
 * 路由结构：
 * - /login：手填租户标识登录；
 * - /t/{slug}/login：租户内登录，登录后回到该租户；
 * - /t/{slug}/s/{questionnaireId}：公开填写页，无需登录，只读取已发布版本；
 * - /t/{slug}/questionnaires：需登录，列表与编辑器由 TenantShell 承载。
 */
export const routes: Routes = [
  { path: 'login', component: LoginPage },
  {
    path: 't/:tenantSlug',
    canActivate: [tenantSlugGuard],
    children: [
      { path: 'login', component: LoginPage },
      { path: 's/:questionnaireId', component: PublicSurveyPage },
      {
        path: '',
        canActivate: [authGuard],
        component: TenantShell,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'questionnaires' },
          { path: 'questionnaires', component: QuestionnaireListPage },
          {
            path: 'questionnaires/:questionnaireId',
            component: QuestionnaireEditorPage,
          },
        ],
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
