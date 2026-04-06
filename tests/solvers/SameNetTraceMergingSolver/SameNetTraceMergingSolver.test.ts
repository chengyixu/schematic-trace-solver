import { test, expect } from "bun:test"
import { SameNetTraceMergingSolver } from "lib/solvers/SameNetTraceMergingSolver/SameNetTraceMergingSolver"
import type { SolvedTracePath } from "lib/solvers/SchematicTraceLinesSolver/SchematicTraceLinesSolver"
import type { InputProblem } from "lib/types/InputProblem"

const makeInputProblem = (): InputProblem => ({
  chips: [
    {
      chipId: "U1",
      center: { x: 0, y: 0 },
      width: 2,
      height: 1,
      pins: [
        { pinId: "U1.1", x: -1, y: 0.3 },
        { pinId: "U1.2", x: -1, y: -0.3 },
        { pinId: "U1.3", x: 1, y: 0.3 },
        { pinId: "U1.4", x: 1, y: -0.3 },
      ],
    },
    {
      chipId: "U2",
      center: { x: 4, y: 0 },
      width: 2,
      height: 1,
      pins: [
        { pinId: "U2.1", x: 3, y: 0.3 },
        { pinId: "U2.2", x: 3, y: -0.3 },
        { pinId: "U2.3", x: 5, y: 0.3 },
        { pinId: "U2.4", x: 5, y: -0.3 },
      ],
    },
  ],
  connections: [],
  netLabels: [],
})

test("merges horizontal segments of same-net traces at close Y values", () => {
  // Two traces in the same net with horizontal segments at slightly different Y values
  // The horizontal segments overlap in the X range (both span x=0 to x=2)
  const traces: SolvedTracePath[] = [
    {
      mspPairId: "pair1",
      dcConnNetId: "net1",
      globalConnNetId: "net1",
      pins: [
        { pinId: "U1.1", chipId: "U1", x: -1, y: 0.3 },
        { pinId: "U1.3", chipId: "U1", x: 1, y: 0.3 },
      ],
      tracePath: [
        { x: -1, y: 0.3 },
        { x: -1, y: 0.8 }, // go up
        { x: 2, y: 0.8 }, // horizontal at y=0.8 from x=-1 to x=2
        { x: 2, y: 0.3 }, // come back down
      ],
      mspConnectionPairIds: ["pair1"],
      pinIds: ["U1.1", "U1.3"],
    },
    {
      mspPairId: "pair2",
      dcConnNetId: "net1",
      globalConnNetId: "net1", // same net!
      pins: [
        { pinId: "U2.1", chipId: "U2", x: 3, y: 0.3 },
        { pinId: "U2.3", chipId: "U2", x: 5, y: 0.3 },
      ],
      tracePath: [
        { x: 0, y: 0.3 },
        { x: 0, y: 0.88 }, // go up
        { x: 3, y: 0.88 }, // horizontal at y=0.88 from x=0 to x=3 -- overlaps with [-1,2] in X!
        { x: 3, y: 0.3 }, // come back down
      ],
      mspConnectionPairIds: ["pair2"],
      pinIds: ["U2.1", "U2.3"],
    },
  ]

  const solver = new SameNetTraceMergingSolver({
    inputProblem: makeInputProblem(),
    traces,
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const output = solver.getOutput()
  const trace1 = output.traces.find((t) => t.mspPairId === "pair1")!
  const trace2 = output.traces.find((t) => t.mspPairId === "pair2")!

  // The horizontal segments at y=0.8 and y=0.88 should now be at the same Y
  const horzY1 = trace1.tracePath[1].y // second point of trace1 (start of horizontal)
  const horzY2 = trace2.tracePath[1].y // second point of trace2 (start of horizontal)

  expect(Math.abs(horzY1 - horzY2)).toBeLessThan(0.01)
})

test("does not merge traces from different nets", () => {
  const traces: SolvedTracePath[] = [
    {
      mspPairId: "pair1",
      dcConnNetId: "net1",
      globalConnNetId: "net1",
      pins: [
        { pinId: "U1.1", chipId: "U1", x: -1, y: 0.3 },
        { pinId: "U1.3", chipId: "U1", x: 1, y: 0.3 },
      ],
      tracePath: [
        { x: -1, y: 0.3 },
        { x: -1, y: 0.8 },
        { x: 1, y: 0.8 },
        { x: 1, y: 0.3 },
      ],
      mspConnectionPairIds: ["pair1"],
      pinIds: ["U1.1", "U1.3"],
    },
    {
      mspPairId: "pair2",
      dcConnNetId: "net2",
      globalConnNetId: "net2", // DIFFERENT net
      pins: [
        { pinId: "U2.1", chipId: "U2", x: 3, y: 0.3 },
        { pinId: "U2.3", chipId: "U2", x: 5, y: 0.3 },
      ],
      tracePath: [
        { x: 3, y: 0.3 },
        { x: 3, y: 0.88 },
        { x: 5, y: 0.88 },
        { x: 5, y: 0.3 },
      ],
      mspConnectionPairIds: ["pair2"],
      pinIds: ["U2.1", "U2.3"],
    },
  ]

  const solver = new SameNetTraceMergingSolver({
    inputProblem: makeInputProblem(),
    traces,
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const output = solver.getOutput()
  const trace1 = output.traces.find((t) => t.mspPairId === "pair1")!
  const trace2 = output.traces.find((t) => t.mspPairId === "pair2")!

  // Should NOT be merged since they're different nets
  expect(trace1.tracePath[1].y).toBeCloseTo(0.8, 5)
  expect(trace2.tracePath[1].y).toBeCloseTo(0.88, 5)
})

test("merges vertical segments of same-net traces at close X values", () => {
  const traces: SolvedTracePath[] = [
    {
      mspPairId: "pair1",
      dcConnNetId: "net1",
      globalConnNetId: "net1",
      pins: [
        { pinId: "U1.1", chipId: "U1", x: -1, y: 0.3 },
        { pinId: "U1.2", chipId: "U1", x: -1, y: -0.3 },
      ],
      tracePath: [
        { x: -1, y: 0.3 },
        { x: 2.0, y: 0.3 }, // horizontal
        { x: 2.0, y: -0.3 }, // vertical at x=2.0
        { x: -1, y: -0.3 }, // horizontal back
      ],
      mspConnectionPairIds: ["pair1"],
      pinIds: ["U1.1", "U1.2"],
    },
    {
      mspPairId: "pair2",
      dcConnNetId: "net1",
      globalConnNetId: "net1",
      pins: [
        { pinId: "U2.1", chipId: "U2", x: 3, y: 0.3 },
        { pinId: "U2.2", chipId: "U2", x: 3, y: -0.3 },
      ],
      tracePath: [
        { x: 3, y: 0.3 },
        { x: 2.1, y: 0.3 }, // horizontal
        { x: 2.1, y: -0.3 }, // vertical at x=2.1 -- close to 2.0!
        { x: 3, y: -0.3 }, // horizontal back
      ],
      mspConnectionPairIds: ["pair2"],
      pinIds: ["U2.1", "U2.2"],
    },
  ]

  const solver = new SameNetTraceMergingSolver({
    inputProblem: makeInputProblem(),
    traces,
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const output = solver.getOutput()
  const trace1 = output.traces.find((t) => t.mspPairId === "pair1")!
  const trace2 = output.traces.find((t) => t.mspPairId === "pair2")!

  // The vertical segments at x=2.0 and x=2.1 should now be at the same X
  const vertX1 = trace1.tracePath[1].x
  const vertX2 = trace2.tracePath[1].x

  expect(Math.abs(vertX1 - vertX2)).toBeLessThan(0.01)
})

test("does not merge segments that are far apart in primary coordinate", () => {
  const traces: SolvedTracePath[] = [
    {
      mspPairId: "pair1",
      dcConnNetId: "net1",
      globalConnNetId: "net1",
      pins: [
        { pinId: "U1.1", chipId: "U1", x: -1, y: 0.3 },
        { pinId: "U1.3", chipId: "U1", x: 1, y: 0.3 },
      ],
      tracePath: [
        { x: -1, y: 0.3 },
        { x: -1, y: 0.8 },
        { x: 1, y: 0.8 }, // horizontal at y=0.8
        { x: 1, y: 0.3 },
      ],
      mspConnectionPairIds: ["pair1"],
      pinIds: ["U1.1", "U1.3"],
    },
    {
      mspPairId: "pair2",
      dcConnNetId: "net1",
      globalConnNetId: "net1",
      pins: [
        { pinId: "U2.1", chipId: "U2", x: 3, y: 0.3 },
        { pinId: "U2.3", chipId: "U2", x: 5, y: 0.3 },
      ],
      tracePath: [
        { x: 3, y: 0.3 },
        { x: 3, y: 2.0 },
        { x: 5, y: 2.0 }, // horizontal at y=2.0 -- far from 0.8
        { x: 5, y: 0.3 },
      ],
      mspConnectionPairIds: ["pair2"],
      pinIds: ["U2.1", "U2.3"],
    },
  ]

  const solver = new SameNetTraceMergingSolver({
    inputProblem: makeInputProblem(),
    traces,
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const output = solver.getOutput()
  const trace1 = output.traces.find((t) => t.mspPairId === "pair1")!
  const trace2 = output.traces.find((t) => t.mspPairId === "pair2")!

  // Should NOT be merged since y values are too far apart
  expect(trace1.tracePath[1].y).toBeCloseTo(0.8, 5)
  expect(trace2.tracePath[1].y).toBeCloseTo(2.0, 5)
})

test("does not merge segments that don't overlap in perpendicular range", () => {
  // Two horizontal segments at close Y values but they don't overlap in X range
  const traces: SolvedTracePath[] = [
    {
      mspPairId: "pair1",
      dcConnNetId: "net1",
      globalConnNetId: "net1",
      pins: [
        { pinId: "U1.1", chipId: "U1", x: -1, y: 0.3 },
        { pinId: "U1.3", chipId: "U1", x: 1, y: 0.3 },
      ],
      tracePath: [
        { x: -5, y: 0.3 },
        { x: -5, y: 0.8 },
        { x: -3, y: 0.8 }, // horizontal at y=0.8, from x=-5 to x=-3
        { x: -3, y: 0.3 },
      ],
      mspConnectionPairIds: ["pair1"],
      pinIds: ["U1.1", "U1.3"],
    },
    {
      mspPairId: "pair2",
      dcConnNetId: "net1",
      globalConnNetId: "net1",
      pins: [
        { pinId: "U2.1", chipId: "U2", x: 3, y: 0.3 },
        { pinId: "U2.3", chipId: "U2", x: 5, y: 0.3 },
      ],
      tracePath: [
        { x: 3, y: 0.3 },
        { x: 3, y: 0.88 },
        { x: 5, y: 0.88 }, // horizontal at y=0.88, from x=3 to x=5 -- no X overlap with [-5,-3]
        { x: 5, y: 0.3 },
      ],
      mspConnectionPairIds: ["pair2"],
      pinIds: ["U2.1", "U2.3"],
    },
  ]

  const solver = new SameNetTraceMergingSolver({
    inputProblem: makeInputProblem(),
    traces,
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  const output = solver.getOutput()
  const trace1 = output.traces.find((t) => t.mspPairId === "pair1")!
  const trace2 = output.traces.find((t) => t.mspPairId === "pair2")!

  // Should NOT be merged since segments don't overlap in X range
  expect(trace1.tracePath[1].y).toBeCloseTo(0.8, 5)
  expect(trace2.tracePath[1].y).toBeCloseTo(0.88, 5)
})
