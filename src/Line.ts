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
 * Representation of a line made up of points.
 *
 * @export
 * @class Line
 * @typedef {Line}
 */
export class Line {
    public points: Point[] = [];

    /**
     * Creates a new line starting from the given point.
     *
     * @constructor
     * @param {Point} startPoint 
     */
    constructor(startPoint: Point) {
        this.points = [];
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
}
