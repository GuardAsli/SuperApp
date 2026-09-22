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

export default crons;
