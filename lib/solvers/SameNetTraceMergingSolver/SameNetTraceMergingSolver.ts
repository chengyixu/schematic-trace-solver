import { BaseSolver } from "lib/solvers/BaseSolver/BaseSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { SolvedTracePath } from "lib/solvers/SchematicTraceLinesSolver/SchematicTraceLinesSolver"
import type { GraphicsObject } from "graphics-debug"
import { visualizeInputProblem } from "lib/solvers/SchematicTracePipelineSolver/visualizeInputProblem"
import type { Point } from "@tscircuit/math-utils"

/**
 * Threshold for considering two coordinates as "close" enough to merge.
 * Segments within this distance will be snapped to the same coordinate.
 */
const MERGE_THRESHOLD = 0.15

const EPS = 1e-6

interface Segment {
  traceIndex: number
  pointIndex: number
  p1: Point
  p2: Point
  orientation: "horizontal" | "vertical"
  /** The coordinate that is shared between p1 and p2 (Y for horizontal, X for vertical) */
  sharedCoord: number
}

/**
 * The SameNetTraceMergingSolver finds same-net traces with horizontal segments
 * at nearly the same Y coordinate (or vertical segments at nearly the same X
 * coordinate) and snaps them to the same value so the traces visually merge.
 *
 * This addresses the visual issue where two traces of the same net run at
 * slightly different Y/X values instead of being perfectly aligned.
 */
export class SameNetTraceMergingSolver extends BaseSolver {
  inputProblem: InputProblem
  traces: SolvedTracePath[]
  private processed = false

  constructor(params: {
    inputProblem: InputProblem
    traces: SolvedTracePath[]
  }) {
    super()
    this.inputProblem = params.inputProblem
    // Deep clone traces so we can mutate them
    this.traces = params.traces.map((t) => ({
      ...t,
      tracePath: t.tracePath.map((p) => ({ ...p })),
    }))
  }

  override _step() {
    if (this.processed) {
      this.solved = true
      return
    }

    // Group traces by globalConnNetId (same net)
    const netGroups = new Map<string, number[]>()
    for (let i = 0; i < this.traces.length; i++) {
      const netId = this.traces[i].globalConnNetId
      if (!netGroups.has(netId)) {
        netGroups.set(netId, [])
      }
      netGroups.get(netId)!.push(i)
    }

    // For each net group with multiple traces, find and merge close segments
    for (const [_netId, traceIndices] of netGroups) {
      if (traceIndices.length < 2) continue
      this.mergeCloseSegmentsInNet(traceIndices)
    }

    this.processed = true
    this.solved = true
  }

  /**
   * For a group of traces in the same net, find horizontal segments at
   * nearly the same Y and vertical segments at nearly the same X, then
   * snap them to a common coordinate.
   */
  private mergeCloseSegmentsInNet(traceIndices: number[]) {
    // Collect all segments from these traces
    const segments: Segment[] = []
    for (const ti of traceIndices) {
      const path = this.traces[ti].tracePath
      for (let pi = 0; pi < path.length - 1; pi++) {
        const p1 = path[pi]
        const p2 = path[pi + 1]
        const isHorz = Math.abs(p1.y - p2.y) < EPS
        const isVert = Math.abs(p1.x - p2.x) < EPS
        if (isHorz) {
          segments.push({
            traceIndex: ti,
            pointIndex: pi,
            p1,
            p2,
            orientation: "horizontal",
            sharedCoord: p1.y,
          })
        } else if (isVert) {
          segments.push({
            traceIndex: ti,
            pointIndex: pi,
            p1,
            p2,
            orientation: "vertical",
            sharedCoord: p1.x,
          })
        }
      }
    }

    // Group horizontal segments by proximity in Y
    const hSegments = segments.filter((s) => s.orientation === "horizontal")
    const hClusters = this.clusterByProximity(hSegments)

    // Group vertical segments by proximity in X
    const vSegments = segments.filter((s) => s.orientation === "vertical")
    const vClusters = this.clusterByProximity(vSegments)

    // Merge each cluster — snap all segments to the average coordinate
    for (const cluster of [...hClusters, ...vClusters]) {
      if (cluster.length < 2) continue

      // Only merge if the cluster contains segments from different traces
      const uniqueTraces = new Set(cluster.map((s) => s.traceIndex))
      if (uniqueTraces.size < 2) continue

      // Also check they overlap in the perpendicular axis (they're actually close spatially)
      if (!this.hasOverlappingRange(cluster)) continue

      const avgCoord =
        cluster.reduce((sum, s) => sum + s.sharedCoord, 0) / cluster.length

      for (const seg of cluster) {
        this.snapSegmentCoordinate(seg, avgCoord)
      }
    }
  }

  /**
   * Check that segments in a cluster actually overlap in the perpendicular
   * direction (i.e., they are spatially close, not just at the same Y/X but
   * far apart horizontally/vertically).
   */
  private hasOverlappingRange(cluster: Segment[]): boolean {
    if (cluster.length < 2) return false

    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const a = cluster[i]
        const b = cluster[j]
        if (a.orientation === "horizontal") {
          // Check X range overlap
          const aMinX = Math.min(a.p1.x, a.p2.x)
          const aMaxX = Math.max(a.p1.x, a.p2.x)
          const bMinX = Math.min(b.p1.x, b.p2.x)
          const bMaxX = Math.max(b.p1.x, b.p2.x)
          const overlap = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX)
          if (overlap > EPS) return true
        } else {
          // Check Y range overlap
          const aMinY = Math.min(a.p1.y, a.p2.y)
          const aMaxY = Math.max(a.p1.y, a.p2.y)
          const bMinY = Math.min(b.p1.y, b.p2.y)
          const bMaxY = Math.max(b.p1.y, b.p2.y)
          const overlap = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY)
          if (overlap > EPS) return true
        }
      }
    }
    return false
  }

  /**
   * Cluster segments whose sharedCoord values are within MERGE_THRESHOLD
   * of each other. Uses single-linkage clustering.
   */
  private clusterByProximity(segments: Segment[]): Segment[][] {
    if (segments.length === 0) return []

    // Sort by sharedCoord
    const sorted = [...segments].sort((a, b) => a.sharedCoord - b.sharedCoord)

    const clusters: Segment[][] = [[sorted[0]]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const lastCluster = clusters[clusters.length - 1]
      const lastCoord = lastCluster[lastCluster.length - 1].sharedCoord

      if (Math.abs(current.sharedCoord - lastCoord) <= MERGE_THRESHOLD) {
        lastCluster.push(current)
      } else {
        clusters.push([current])
      }
    }

    return clusters
  }

  /**
   * Snap a segment's shared coordinate to a new value.
   * For horizontal segments: change Y of both endpoints.
   * For vertical segments: change X of both endpoints.
   * Also adjusts adjacent segments in the trace to maintain connectivity.
   */
  private snapSegmentCoordinate(seg: Segment, newCoord: number) {
    const trace = this.traces[seg.traceIndex]
    const path = trace.tracePath
    const pi = seg.pointIndex

    if (seg.orientation === "horizontal") {
      const oldY = path[pi].y
      if (Math.abs(oldY - newCoord) < EPS) return // Already at target

      // Snap both points of this segment
      path[pi] = { ...path[pi], y: newCoord }
      path[pi + 1] = { ...path[pi + 1], y: newCoord }

      // Adjust adjacent vertical segments to connect
      if (pi > 0) {
        const prevPt = path[pi - 1]
        const isVertAdj = Math.abs(prevPt.x - path[pi].x) < EPS
        if (isVertAdj) {
          // The previous segment was vertical connecting to this horizontal
          // No need to adjust - the vertical segment just extends/shrinks
        }
      }
      if (pi + 2 < path.length) {
        const nextPt = path[pi + 2]
        const isVertAdj = Math.abs(nextPt.x - path[pi + 1].x) < EPS
        if (isVertAdj) {
          // The next segment is vertical - it automatically adjusts
        }
      }
    } else {
      // vertical segment
      const oldX = path[pi].x
      if (Math.abs(oldX - newCoord) < EPS) return

      path[pi] = { ...path[pi], x: newCoord }
      path[pi + 1] = { ...path[pi + 1], x: newCoord }
    }
  }

  getOutput() {
    return {
      traces: this.traces,
    }
  }

  override visualize(): GraphicsObject {
    const graphics = visualizeInputProblem(this.inputProblem, {
      chipAlpha: 0.1,
      connectionAlpha: 0.1,
    })

    if (!graphics.lines) graphics.lines = []

    for (const trace of this.traces) {
      graphics.lines.push({
        points: trace.tracePath.map((p) => ({ x: p.x, y: p.y })),
        strokeColor: "blue",
      })
    }

    return graphics
  }
}
