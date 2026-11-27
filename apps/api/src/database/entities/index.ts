import { Invitation } from './invitation.entity';
import { Membership } from './membership.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

/** 集中登记实体，供 Nest 运行时与迁移 CLI 共用。 */
export const ENTITIES = [Tenant, User, Membership, Invitation];

export { Invitation, Membership, Tenant, User };
