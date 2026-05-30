module.exports = {
 apps: [
 {
 name: 'ai-resume',
 script: './dist/src/main.js',
 cwd: __dirname,

 env: {
 NODE_ENV: 'production',
 PORT: 3000,
 PUPPETEER_EXECUTABLE_PATH: '/snap/bin/chromium',
 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
 },

 instances: 1,
 exec_mode: 'fork',

 max_memory_restart: '512M',
 max_restarts: 10,
 restart_delay: 5000,

 error_file: './logs/pm2-error.log',
 out_file: './logs/pm2-out.log',
 log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
 merge_logs: true,

 kill_timeout: 10000,
 wait_ready: false,
 listen_timeout: 15000,
 },
 ],
};
