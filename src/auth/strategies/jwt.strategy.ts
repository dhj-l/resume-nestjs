import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenBlacklistService } from '../token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private tokenBlacklistService: TokenBlacklistService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'secretKey',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

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
