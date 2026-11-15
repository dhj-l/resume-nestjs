import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AdminUsersController } from './admin-users.controller';
import { User, UserSchema } from './entities/user.entity';
import {
  LoginAttempt,
  LoginAttemptSchema,
} from './entities/login-attempt.entity';
import { LoginAttemptService } from './login-attempt.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: LoginAttempt.name, schema: LoginAttemptSchema },
    ]),
    AuthModule,
  ],
  controllers: [UserController, AdminUsersController],
  providers: [UserService, LoginAttemptService],
  exports: [UserService],
})
export class UserModule {}
