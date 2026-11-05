// PM2 config — runs under the "retailverse" user's own PM2, separate from any other project.
module.exports = {
  apps: [
    {
      name: "retailverse-api",
      cwd: "/home/retailverse/app/Backend",
      script: "server.js",
      instances: 1,            // socket.io + in-memory caches: keep a single instance
      exec_mode: "fork",
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
      out_file: "/home/retailverse/logs/api-out.log",
      error_file: "/home/retailverse/logs/api-err.log",
      time: true,
    },
  ],
};

