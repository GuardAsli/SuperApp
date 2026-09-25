/** GuardAsli — cronهای پس‌زمینه. */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "process payment and build jobs",
  { minutes: 1 },
  internal.workerActions.processDueJobs,
  { limit: 25 },
);

/** اجراکننده provisioning — هر دقیقه کارهای سررسید اشتراک‌های سروردار را به provider می‌رساند. */
crons.interval(
  "process provision jobs",
  { minutes: 1 },
  internal.provisionWorker.processDueProvisions,
  { limit: 10 },
);

crons.interval(
  "purge expired sessions",
  { hours: 1 },
  internal.jobs.purgeExpiredSessions,
  { limit: 300 },
);

/** بکاپ خودکار روزانه ساعت ۰۳:۰۰ UTC */
crons.daily(
  "nightly encrypted backup",
  { hourUTC: 3, minuteUTC: 0 },
  internal.backupAuto.enqueueNightlyBackup,
);

/** ترمیم روزانه webhook همه‌ی ربات‌های روشن — اگر پاک شده باشد خودش برمی‌گردد. */
crons.daily(
  "ensure telegram webhooks",
  { hourUTC: 4, minuteUTC: 30 },
  internal.telegramActions.ensureBotWebhooksInternal,
);

export default crons;
