import { resetE2eEnv } from './helpers/test-env';

/**
 * jest-e2e 的 setupFiles：先于任何测试模块加载执行，
 * 把 MONGODB_URI / JWT_SECRET / 上游密钥等强制切到测试值。
 *
 * 注意：@nestjs/config 的 ConfigModule 使用 dotenv 加载 .env，
 * 而 dotenv 不会覆盖已存在的 process.env，因此这里设置的值优先。
 */
resetE2eEnv();
