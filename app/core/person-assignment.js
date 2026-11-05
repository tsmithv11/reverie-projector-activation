// Rectangular Hungarian assignment: each detection gets either one existing
// track or its own unmatched slot. Polynomial cost keeps crowded frames cheap.
export function assignPeople(costs, count, unmatched = .85) {
  const columns = costs.length + count;
  const u = new Float64Array(count + 1), v = new Float64Array(columns + 1);
  const owner = new Int32Array(columns + 1), previous = new Int32Array(columns + 1);
  for (let row = 1; row <= count; row++) {
    owner[0] = row;
    const min = new Float64Array(columns + 1).fill(Infinity), used = new Uint8Array(columns + 1);
    let column = 0;
    do {
      used[column] = 1;
      const current = owner[column];
      let delta = Infinity, next = 0;
      for (let j = 1; j <= columns; j++) {
        if (used[j]) continue;
        const raw = j <= costs.length ? costs[j - 1][current - 1] : unmatched;
        const cost = (Number.isFinite(raw) ? raw : 1e6) - u[current] - v[j];
        if (cost < min[j]) { min[j] = cost; previous[j] = column; }
        if (min[j] < delta) { delta = min[j]; next = j; }
      }
      for (let j = 0; j <= columns; j++) {
        if (used[j]) { u[owner[j]] += delta; v[j] -= delta; }
        else min[j] -= delta;
      }
      column = next;
    } while (owner[column]);
    do {
      const next = previous[column]; owner[column] = owner[next]; column = next;
    } while (column);
  }
  const matched = new Map();
  for (let j = 1; j <= costs.length; j++) {
    if (owner[j] && costs[j - 1][owner[j] - 1] < unmatched) matched.set(owner[j] - 1, j - 1);
  }
  return matched;
}
