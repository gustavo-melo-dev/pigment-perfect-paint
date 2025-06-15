import p5 from 'p5';
import { Brush } from './Brush';

/**
 * @class Line
 * @description Represents a single continuous line drawn by the user, composed of multiple points.
 */
export class Line {
    public points: p5.Vector[] = [];

    constructor(v: p5.Vector) {
        this.points = [];
        this.addPoint(v);
    }

    /**
     * @method addPoint
     * @description Adds a new point to the line.
     * @param {p5} p - The p5 instance used for creating vectors.
     * @param {number} x - The x-coordinate of the point.
     * @param {number} y - The y-coordinate of the point.
     */
    public addPoint(v: p5.Vector): void {
        this.points.push(v);
    }

    /**
     * @method draw
     * @description Renders the line on the canvas by connecting its points.
     */
    public draw(p: p5, brush: Brush): void {
        if (this.points.length < 2) {
            if (this.points.length === 1) {
                p.stroke(brush.color);
                p.strokeWeight(brush.size);
                p.point(this.points[0].x, this.points[0].y);
            }
            return;
        }

        p.noFill();
        p.stroke(brush.color);
        p.strokeWeight(brush.size);
        p.strokeJoin(p.ROUND);
        p.strokeCap(p.ROUND);

        p.beginShape();
        for (const point of this.points) {
            p.vertex(point.x, point.y);
        }
        p.endShape();
    }
}
