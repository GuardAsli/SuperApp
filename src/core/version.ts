import { VERSION_FORMAT_PATTERN } from "./identity";

/** Parse an isMAJOR.MINOR.PATCH string into numeric parts. */
export function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const m = VERSION_FORMAT_PATTERN.exec(v);
  if (!m) return null;
  return {
    major: Number(v.slice(2, v.indexOf("."))),
    minor: Number(v.slice(v.indexOf(".") + 1, v.lastIndexOf("."))),
    patch: Number(v.slice(v.lastIndexOf(".") + 1)),
  };
}

export function isValidVersion(v: string): boolean {
  return parseVersion(v) !== null;
}

/** -1 if a<b, 1 if a>b, 0 if equal. Invalid versions compare by string. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa && pb) {
    if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
    if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
    if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

type Bump = "major" | "minor" | "patch";
export function bumpVersion(v: string, part: Bump): string {
  const p = parseVersion(v);
  if (!p) throw new Error(`invalid version format: ${v}`);
  if (part === "major") return `is${p.major + 1}.0.0`;
  if (part === "minor") return `is${p.major}.${p.minor + 1}.0`;
  return `is${p.major}.${p.minor}.${p.patch + 1}`;
}

/** Compatibility rule: same major required. */
export function isCompatible(current: string, candidate: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(candidate);
  if (!a || !b) return false;
  return a.major === b.major;
}
