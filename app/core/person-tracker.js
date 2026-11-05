import limits from './segmentation-limits.cjs';
import { assignPeople } from './person-assignment.js';

// Short-lived, in-memory tracks. No face recognition or persistent identity.
export const TRACK_COLORS = ['#FAA0D0', '#7A9DDA', '#B8D8AE', '#C49ED8', '#FFB795', '#86DDD9', '#E7D2F6', '#E8D590', '#DA82B3', '#95B9FF', '#D1EDBF', '#AA86DD', '#EBA684', '#B1EDE7', '#F5DDF4', '#C6BF7D'];
export const MAX_PEOPLE = limits.MAX_PEOPLE;
export const TRACK_TTL = 1500;
export const CONFIRM_WINDOW = 1000;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class PersonTracker {
  constructor() { this.reset(); }
  reset() { this.tracks = []; this.nextId = 1; }
  update(detections, now) {
    detections = detections.slice(0, MAX_PEOPLE);
    this.tracks = this.tracks.filter(t => now - t.at <= (t.confirmed ? TRACK_TTL : CONFIRM_WINDOW));
    const costs = this.tracks.map(t => detections.map(d => {
      const elapsed = Math.min(.8, Math.max(0, (now - t.at) / 1000));
      const predicted = { x: t.x + t.vx * elapsed, y: t.y + t.vy * elapsed };
      const gate = Math.min(.45, .1 + elapsed * .3 + Math.sqrt(t.area) * .45);
      const delta = distance(predicted, d);
      const appearance = Math.hypot(...d.appearance.map((v, i) => v - t.appearance[i])) / Math.sqrt(d.appearance.length || 1);
      if (delta > gate || (appearance > .45 && delta > .06)) return Infinity;
      return delta / gate * .65 + appearance * 1.1 + Math.min(1, Math.abs(Math.log(d.area / t.area))) * .12;
    }));
    const matched = new Map([...assignPeople(costs, detections.length)].map(([di, ti]) => [di, this.tracks[ti]]));
    const reserved = new Set(matched.values());
    const visible = detections.map((d, di) => {
      let track = matched.get(di);
      if (track) {
        // A new highlight needs two consecutive, distinct camera captures.
        // Confirmed tracks can return immediately after a brief occlusion.
        if (track.seenLast && now > track.at && now - track.at <= CONFIRM_WINDOW) track.confirmed = true;
        const dt = Math.max(.03, (now - track.at) / 1000);
        track.vx = track.vx * .35 + Math.max(-1, Math.min(1, (d.x - track.x) / dt)) * .65;
        track.vy = track.vy * .35 + Math.max(-1, Math.min(1, (d.y - track.y) / dt)) * .65;
        track.appearance = track.appearance.map((v, i) => v * .9 + d.appearance[i] * .1);
        Object.assign(track, { x: d.x, y: d.y, area: d.area, at: now });
      } else {
        const used = new Set(this.tracks.map(t => t.color));
        let color = TRACK_COLORS.find(c => !used.has(c));
        if (!color) {
          // Reclaim the oldest unassigned dormant track, never a visible one.
          const oldest = this.tracks.filter(t => !reserved.has(t) && t.at !== now).sort((a, b) => a.at - b.at)[0];
          color = oldest?.color || TRACK_COLORS[(this.nextId - 1) % TRACK_COLORS.length];
          if (oldest) this.tracks = this.tracks.filter(t => t !== oldest);
        }
        track = { ...d, appearance: [...d.appearance], id: this.nextId++, color, at: now, vx: 0, vy: 0, confirmed: false };
        this.tracks.push(track);
      }
      reserved.add(track);
      return { id: track.id, color: track.color, x: d.x, y: d.y, top: d.top, confirmed: track.confirmed };
    });
    for (const track of this.tracks) track.seenLast = reserved.has(track);
    this.tracks = this.tracks.sort((a, b) => b.at - a.at).slice(0, TRACK_COLORS.length);
    return visible;
  }
}
