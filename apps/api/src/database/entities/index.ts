import { Invitation } from './invitation.entity';
import { Membership } from './membership.entity';
import { Questionnaire } from './questionnaire.entity';
import { QuestionnaireVersion } from './questionnaire-version.entity';
import { SurveyResponse } from './survey-response.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

/** 集中登记实体，供 Nest 运行时与迁移 CLI 共用。 */
export const ENTITIES = [
  Tenant,
  User,
  Membership,
  Invitation,
  Questionnaire,
  QuestionnaireVersion,
  SurveyResponse,
];

export {
  Invitation,
  Membership,
  Questionnaire,
  QuestionnaireVersion,
  SurveyResponse,
  Tenant,
  User,
};
