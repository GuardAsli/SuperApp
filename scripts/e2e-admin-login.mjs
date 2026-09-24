// GuardAsli — local dev helper: log in the bootstrap super admin against the
// local backend and cache the access token for e2e verification scripts.
// The admin password comes from the process environment (never printed/stored).
const pass = process.env.GUARDASLI_ADMIN_PASS ?? "";
if (!pass) {
  console.error("NO_ADMIN_PASS_IN_ENV");
  process.exit(1);
}
const base = process.env.GA_BASE ?? "http://127.0.0.1:3211";
const res = await fetch(`${base}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: process.env.GA_ADMIN_USER ?? "admin", password: pass }),
});
const data = await res.json();
if (!data.accessToken) {
  console.error("LOGIN_FAILED", JSON.stringify(data).slice(0, 200));
  process.exit(1);
}
const fs = await import("node:fs");
fs.writeFileSync(process.env.GA_TOKEN_OUT ?? "/tmp/ga_token", data.accessToken, "utf8");
console.log("LOGIN_OK role=" + data.role + " tenant=" + data.tenantId);
