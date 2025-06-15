import p5 from "p5";
import { Line } from "./Line";

export class Brush {
    private p: p5;
    public color: p5.Color;
    public size: number;

    constructor(p: p5, color: p5.Color = p.color(0), size: number = 4) {
        this.p = p;
        this.color = color;
        this.size = size;
    }

    draw(line: Line) {
        if (line.points.length < 1) {
            return;
        }

        if (line.points.length === 1) {
            this.p.stroke(this.color);
            this.p.strokeWeight(this.size);
            this.p.point(line.points[0].x, line.points[0].y);
            return;
        }

        this.p.noFill();
        this.p.stroke(this.color);
        this.p.strokeWeight(this.size);
        this.p.strokeJoin(this.p.ROUND);
        this.p.strokeCap(this.p.ROUND);

        this.p.beginShape();
        for (const point of line.points) {
            this.p.vertex(point.x, point.y);
        }
        this.p.endShape();
    }
}
