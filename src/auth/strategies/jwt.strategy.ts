import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from '../token-blacklist.service';
import { extractBearerToken } from '../../common/utils/token';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private tokenBlacklistService: TokenBlacklistService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const token = extractBearerToken(req);

    if (token) {
      const blacklisted = await this.tokenBlacklistService.isBlacklisted(token);
      if (blacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    return {
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
    };
  }
}
