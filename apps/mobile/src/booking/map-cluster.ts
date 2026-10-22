// Pure map maths: project positions into a viewport and merge pins that would overlap.
import { BUENOS_AIRES_BOUNDS, type LatLng } from './localities';

export interface Viewport {
  north: number;
  south: number;
  west: number;
  east: number;
}

export const DEFAULT_VIEWPORT: Viewport = BUENOS_AIRES_BOUNDS;

/** Pins closer than this many points merge into one cluster. */
export const CLUSTER_RADIUS = 44;

export interface Point {
  x: number;
  y: number;
}

export function project(pos: LatLng, view: Viewport, width: number, height: number): Point {
  return {
    x: ((pos.lng - view.west) / (view.east - view.west)) * width,
    y: ((view.north - pos.lat) / (view.north - view.south)) * height,
  };
}

export interface Pin<T> {
  item: T;
  pos: LatLng;
}

export interface Cluster<T> {
  key: string;
  members: Pin<T>[];
  point: Point;
}

/** Greedy grid-free clustering in screen space: a pin joins the first cluster within the radius. */
export function clusterPins<T extends { id: string }>(
  pins: Pin<T>[],
  view: Viewport,
  width: number,
  height: number,
  radius = CLUSTER_RADIUS,
): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];
  const sorted = [...pins].sort((a, b) => a.item.id.localeCompare(b.item.id));
  for (const pin of sorted) {
    const p = project(pin.pos, view, width, height);
    if (p.x < -radius || p.y < -radius || p.x > width + radius || p.y > height + radius) continue;
    const near = clusters.find((c) => Math.hypot(c.point.x - p.x, c.point.y - p.y) <= radius);
    if (near) {
      near.members.push(pin);
      const n = near.members.length;
      near.point = {
        x: (near.point.x * (n - 1) + p.x) / n,
        y: (near.point.y * (n - 1) + p.y) / n,
      };
    } else {
      clusters.push({ key: pin.item.id, members: [pin], point: p });
    }
  }
  return clusters;
}

const MIN_SPAN = 0.004;

/** Viewport that frames `positions` with some padding, in the proportions of the current one. */
export function fitViewport(positions: LatLng[], current: Viewport): Viewport {
  const lats = positions.map((p) => p.lat);
  const lngs = positions.map((p) => p.lng);
  const ratio = (current.east - current.west) / (current.north - current.south);
  const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), MIN_SPAN) * 1.6;
  const lngSpan = Math.max(Math.max(...lngs) - Math.min(...lngs), MIN_SPAN) * 1.6;
  const span = Math.max(latSpan, lngSpan / ratio);
  const lat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const lng = (Math.max(...lngs) + Math.min(...lngs)) / 2;
  return {
    north: lat + span / 2,
    south: lat - span / 2,
    west: lng - (span * ratio) / 2,
    east: lng + (span * ratio) / 2,
  };
}
