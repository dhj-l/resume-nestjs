/**
 * PM2 进程管理配置
 *
 * 使用方式:
 *   pm2 start ecosystem.config.js           # 启动
 *   pm2 stop ai-resume                       # 停止
 *   pm2 restart ai-resume                    # 重启
 *   pm2 reload ai-resume                     # 零停机重载
 *   pm2 logs ai-resume                       # 查看日志
 *   pm2 save && pm2 startup                  # 设置开机自启
 */

module.exports = {
  apps: [
    {
      name: 'ai-resume',
      script: './dist/main.js',
      cwd: __dirname,

      // 生产模式
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // 进程数量（单实例，MongoDB 连接不适合多实例）
      instances: 1,
      exec_mode: 'fork',

      // 自动重启配置
      max_memory_restart: '512M',
      max_restarts: 10,
      restart_delay: 5000,

      // 日志配置
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,

      // 优雅关闭
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 15000,
    },
  ],
};
