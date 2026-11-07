import { W, WALL, KEY, EXIT } from "../../shared/engine";

type Props = {
  cells: number[];
  player?: [number, number];
  start?: [number, number];
  locked?: boolean; // exit still locked
  trail?: [number, number][];
};

// Everything is drawn on a 10x10 pixel-ish tile so the board scales cleanly.
export function Grid({ cells, player, start, locked = true, trail = [] }: Props) {
  const T = 10;
  return (
    <svg className="board" viewBox={`0 0 ${W * T} ${W * T}`} role="img" aria-label="Puzzle grid" shapeRendering="crispEdges">
      <defs>
        <pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="2" fill="var(--ink)" />
          <rect width="0.7" height="2" fill="var(--paper-dark)" />
        </pattern>
      </defs>
      <rect width={W * T} height={W * T} fill="var(--paper)" />
      {cells.map((c, i) => {
        const x = (i % W) * T, y = ((i / W) | 0) * T;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect width={T} height={T} fill="none" stroke="var(--rule)" strokeWidth={0.25} />
            {c === WALL && <rect x={0.4} y={0.4} width={T - 0.8} height={T - 0.8} fill="url(#hatch)" stroke="var(--ink)" strokeWidth={0.8} />}
            {c === KEY && (
              <g fill="var(--rust)">
                <rect x={2.2} y={3} width={3} height={3} />
                <rect x={3.2} y={4} width={1} height={1} fill="var(--paper)" />
                <rect x={5.2} y={4.1} width={3} height={0.9} />
                <rect x={6.8} y={5} width={0.9} height={1.6} />
              </g>
            )}
            {c === EXIT && (
              <g>
                <rect x={1.6} y={1.2} width={6.8} height={7.6} fill={locked ? "var(--paper-dark)" : "var(--teal)"} stroke="var(--ink)" strokeWidth={0.7} />
                {locked ? (
                  <path d="M3.4 3.4 L6.6 6.6 M6.6 3.4 L3.4 6.6" stroke="var(--ink)" strokeWidth={0.8} />
                ) : (
                  <rect x={3.6} y={3.2} width={2.8} height={5.6} fill="var(--paper)" />
                )}
              </g>
            )}
          </g>
        );
      })}
      {trail.map(([x, y], i) => (
        <rect key={`t${i}`} x={x * T + 4.2} y={y * T + 4.2} width={1.6} height={1.6} fill="var(--teal)" opacity={0.55} />
      ))}
      {start && !player && <rect x={start[0] * T + 2} y={start[1] * T + 2} width={6} height={6} fill="none" stroke="var(--ink)" strokeWidth={0.8} strokeDasharray="1.2 1" />}
      {player && (
        <g transform={`translate(${player[0] * T} ${player[1] * T})`} className="pawn">
          <rect x={2} y={2} width={6} height={6} fill="var(--ink)" />
          <rect x={3.4} y={3.6} width={1.2} height={1.2} fill="var(--paper)" />
          <rect x={5.4} y={3.6} width={1.2} height={1.2} fill="var(--paper)" />
        </g>
      )}
    </svg>
  );
}
