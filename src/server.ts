import app from './app';
import { AppDataSource } from './app-data-source';
import { log, logWarning } from './shared/log';
import { init as initBannedIpCache } from './shared/banned-ip-cache';
import { startBackupSchedule } from './shared/backup-schedule';

const port = process.env.PORT || 3000;

async function startServer() {
  await AppDataSource.initialize();
  await initBannedIpCache();
  startBackupSchedule();
  // PLUGINS: init

  const server = app.listen(port, () => {
    log(`Server is running at http://localhost:${port}.`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      const fallbackPort = Number(port) + 1;
      logWarning(`Port ${port} is in use, trying ${fallbackPort}...`);
      app.listen(fallbackPort, () => {
        log(`Server is running at http://localhost:${fallbackPort}.`);
      });
    } else {
      throw err;
    }
  });
}

startServer();