/**
 * Map, region and zone contracts (P2.5).
 *
 * The map is authored on the robot and pushed up; labels and zones are authored in the app and
 * pushed down (SYNAPSE_SPEC R3). Both directions exist, and these are their shapes.
 */

import { isNumber, isPolygon, isRecord, isText, type Polygon } from './guards.ts';

export const MapCell = {
  UNKNOWN: 0,
  FREE: 1,
  OCCUPIED: 2,
} as const;

export type MapCell = (typeof MapCell)[keyof typeof MapCell];

/**
 * The largest grid a snapshot may describe — 100 m × 100 m at 5 cm. Run-length encoding means a
 * few bytes can claim any size, so the receiver refuses before it allocates.
 */
export const MAX_MAP_CELLS = 4_000_000;

/**
 * `map.snapshot` — the occupancy grid as it is now. A newer one replaces an older one outright,
 * which is why it is TELEM: nothing is gained by queueing a stale map.
 */
export interface MapSnapshotPayload {
  width: number;
  height: number;
  /** Metres per cell. */
  resolution: number;
  /** World position, in metres, of the grid's bottom-left corner — a ROS map's `origin`. */
  origin: { x: number; y: number };
  /**
   * Row-major, row 0 at the top (the largest `y`), run-length encoded as
   * `[cell, count, cell, count, …]`. Use {@link encodeCells} and {@link decodeCells}.
   */
  // ponytail: the grid rides inline while it fits under MAX_MESSAGE_BYTES. A home that does not
  // fit moves to the bulk HTTP channel with only its metadata announced here (ENVELOPE.md §1).
  cells: number[];
}

export function encodeCells(cells: ArrayLike<number>): number[] {
  const runs: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    if (runs.length > 0 && runs[runs.length - 2] === cell) {
      runs[runs.length - 1] = runs[runs.length - 1]! + 1;
    } else {
      runs.push(cell, 1);
    }
  }
  return runs;
}

/** Only call on a payload that passed {@link isMapSnapshotPayload} — it sizes the result from it. */
export function decodeCells(map: MapSnapshotPayload): Uint8Array {
  const cells = new Uint8Array(map.width * map.height);
  let at = 0;
  for (let i = 0; i < map.cells.length; i += 2) {
    const count = map.cells[i + 1]!;
    cells.fill(map.cells[i]!, at, at + count);
    at += count;
  }
  return cells;
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

export function isMapSnapshotPayload(value: unknown): value is MapSnapshotPayload {
  if (
    !isRecord(value) ||
    !isCount(value.width) ||
    !isCount(value.height) ||
    value.width * value.height > MAX_MAP_CELLS ||
    !isNumber(value.resolution) ||
    value.resolution <= 0 ||
    !isRecord(value.origin) ||
    !isNumber(value.origin.x) ||
    !isNumber(value.origin.y) ||
    !Array.isArray(value.cells) ||
    value.cells.length % 2 !== 0
  ) {
    return false;
  }

  let total = 0;
  for (let i = 0; i < value.cells.length; i += 2) {
    const cell = value.cells[i];
    const count = value.cells[i + 1];
    if ((cell !== MapCell.UNKNOWN && cell !== MapCell.FREE && cell !== MapCell.OCCUPIED) || !isCount(count)) {
      return false;
    }
    total += count;
  }
  return total === value.width * value.height;
}

/** `region.upsert` — a room: an outline and what people call it. */
export interface RegionPayload {
  region_id: string;
  /** At least one of the two names. A robot's own proposal usually has only the language it heard. */
  name_en?: string;
  name_ur?: string;
  polygon: Polygon;
  /**
   * False for a label the robot proposed and nobody has agreed to yet. The robot hedges when it
   * says an unconfirmed name, and never acts on it as certain (HEART_DECISIONS 21).
   */
  confirmed: boolean;
}

export function isRegionPayload(value: unknown): value is RegionPayload {
  return (
    isRecord(value) &&
    isText(value.region_id) &&
    (value.name_en === undefined || isText(value.name_en)) &&
    (value.name_ur === undefined || isText(value.name_ur)) &&
    (value.name_en !== undefined || value.name_ur !== undefined) &&
    isPolygon(value.polygon) &&
    typeof value.confirmed === 'boolean'
  );
}

/** `region.confirm` — a human agreeing with a proposed label. A correction is a `region.upsert`. */
export interface RegionConfirmPayload {
  region_id: string;
}

export function isRegionConfirmPayload(value: unknown): value is RegionConfirmPayload {
  return isRecord(value) && isText(value.region_id);
}

/** `zone.upsert` — an area the robot must never enter. */
export interface ZonePayload {
  zone_id: string;
  polygon: Polygon;
}

export function isZonePayload(value: unknown): value is ZonePayload {
  return isRecord(value) && isText(value.zone_id) && isPolygon(value.polygon);
}
