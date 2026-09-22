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

export default crons;
