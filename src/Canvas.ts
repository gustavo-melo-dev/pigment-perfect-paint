import p5 from 'p5';

export class Canvas {
    private p: p5;

    constructor(p: p5) {
        this.p = p;
    }

    setupCanvas(width: number, height: number) {
        this.p.pixelDensity(window.devicePixelRatio || 1);
        this.p.createCanvas(width, height);
        this.clear();
    }

    clear() {
        this.p.background(255);
    }
}
