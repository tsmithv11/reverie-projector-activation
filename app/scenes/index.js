import Afterglow from './afterglow.js';
import Heat from './heat.js';
import Robots from './robots.js';
import Monsters from './monsters.js';
import LivingMonsters from './monsters-living.js';
import Lines from './lines.js';
import Garden from './garden.js';
import Words from './words.js';
// Lucy scenes use the same live-video renderer inside the shared camera portal.
export const registry = { heat: Heat, robots: Robots, monsters: Monsters, lines: Lines, garden: Garden, cartoon: Robots, words: Words, ghibli25: Robots, monstersLiving: LivingMonsters, afterglow: Afterglow, customRestyle: Robots };
