/* eslint-disable */
/** Stub until `bunx convex dev` regenerates. */
export const api = anyProxy();
export const internal = anyProxy();
function anyProxy() {
  return new Proxy({}, { get: () => anyProxy(), apply: () => undefined });
}
