/**
 * Representation of a point in 2D space.
 *
 * @export
 * @interface Point
 * @typedef {Point}
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Representation of a line made up of points and a RGBA color.
 *
 * @export
 * @class Line
 * @typedef {Line}
 */
export class Line {
    public points: Point[] = [];
    public color: [number, number, number, number]; // RGBA color
    public drawnPointCount: number = 0; // Track how many points have been drawn

    /**
     * Creates a new line starting from the given point.
     *
     * @constructor
     * @param {Point} startPoint 
     */
    constructor(startPoint: Point, color: [number, number, number, number] = [0, 0, 0, 1]) {
        this.points = [];
        this.color = color;
        this.drawnPointCount = 0;
        this.addPoint(startPoint);
    }

    /**
     * Adds a point to the line.
     *
     * @param {Point} p 
     */
    addPoint(p: Point) {
        this.points.push(p);
    }

    /**
     * Gets the points that haven't been drawn yet.
     * Returns enough points to draw new segments with proper smoothing.
     */
    getNewPoints(): Point[] {
        if (this.points.length <= this.drawnPointCount) {
            return [];
        }

        // For Catmull-Rom splines, we need at least 4 points to draw
        // Include some overlap to ensure smooth connection with previously drawn segments
        const startIndex = Math.max(0, this.drawnPointCount - 3);
        return this.points.slice(startIndex);
    }

    /**
     * Marks points as drawn up to the current point count.
     */
    markAsDrawn() {
        this.drawnPointCount = this.points.length;
    }

    /**
     * Calculates a point on a Catmull-Rom spline given four control points and a parameter t.
     *
     * @static
     * @param {Point} p0 - The first control point.
     * @param {Point} p1 - The second control point.
     * @param {Point} p2 - The third control point.
     * @param {Point} p3 - The fourth control point.
     * @param {number} t - The parameter t, which should be in the range [0, 1].
     * @returns {{ x: number, y: number }} 
     */
    static catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): { x: number, y: number } {
        const t2 = t * t;
        const t3 = t2 * t;

        return {
            x: 0.5 * ((2 * p1.x) +
                (-p0.x + p2.x) * t +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),

            y: 0.5 * ((2 * p1.y) +
                (-p0.y + p2.y) * t +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        };
    }

    static buildSmoothPath(points: Point[], segmentsPerSegment = 24): Point[] {
        const out = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];
            for (let s = 0; s < segmentsPerSegment; s++) {
                const t = s / segmentsPerSegment;
                const xy = Line.catmullRom(p0, p1, p2, p3, t);
                out.push(xy);
            }
        }
        out.push(points[points.length - 1]);
        return out;
    }

    static computeArcLengths(path: Point[]): number[] {
        const lens = [0];
        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i - 1].x;
            const dy = path[i].y - path[i - 1].y;
            lens.push(lens[lens.length - 1] + Math.hypot(dx, dy));
        }
        return lens;
    }
}
