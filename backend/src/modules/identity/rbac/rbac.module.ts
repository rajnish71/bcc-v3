// backend/src/modules/identity/rbac/rbac.module.ts
import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacGuard } from './rbac.guard';
import { RbacController } from './rbac.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [RbacController],
  providers: [RbacService, RbacGuard],
  exports: [RbacService, RbacGuard],
})
export class RbacModule {}
