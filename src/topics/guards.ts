/** Runtime checks shared by the payload guards. TypeScript's types vanish on the wire; these do not. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** `[x, y, yaw]` — metres in the map frame, yaw in radians. */
export type Pose = [x: number, y: number, yaw: number];

export function isPose(value: unknown): value is Pose {
  return Array.isArray(value) && value.length === 3 && value.every(isNumber);
}

/** A closed outline in map metres: at least three `[x, y]` corners. */
export type Polygon = Array<[x: number, y: number]>;

export function isPolygon(value: unknown): value is Polygon {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every((corner) => Array.isArray(corner) && corner.length === 2 && corner.every(isNumber))
  );
}
