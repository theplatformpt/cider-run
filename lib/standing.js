import { divisionSizes } from './scoring.js';

// Where one athlete sits right now, from a freshly built board.
export function standingFor(board, athleteId) {
  const i = board._byId[athleteId];
  if (i === undefined) return null;
  const r = board.rows[i];
  const size = divisionSizes(board.rows)[r.g + r.x] || { s: 0, j: 0, o: 0 };
  return {
    division: `${r.x === 'M' ? 'Male' : 'Female'} ${board.groups[r.g]}`,
    s: r.s, sr: r.sr, sn: size.s,
    j: r.j, jr: r.jr, jn: size.j,
    o: r.o, or: r.or, on: size.o,
  };
}
