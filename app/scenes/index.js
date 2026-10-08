import Heat from './heat.js';
import Robots from './robots.js';
import Monsters from './monsters.js';
import Lines from './lines.js';
import Garden from './garden.js';
// Lucy scenes use the same live-video renderer inside the shared camera portal.
export const registry = { heat: Heat, robots: Robots, monsters: Monsters, lines: Lines, garden: Garden, cartoon: Robots };
