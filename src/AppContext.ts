import { Brush } from "./brush/Brush";
import { Canvas } from "./canvas/Canvas";
import { attachEventListeners } from "./events";
import { Line } from "./Line";
import { createFullscreenQuad } from "./webgl/fullscreenQuad";

export class AppContext {
    static brush: Brush;
    static drawing: boolean = false;
    static webglCanvas: Canvas;
    static canvasElement: HTMLCanvasElement;
    static gl: WebGL2RenderingContext;
    static screenVAO: WebGLVertexArrayObject;
    static screenProgram: WebGLProgram;
    static lines: Line[] = [];
    static currentLine: Line | null = null;

    static async initialize(): Promise<void> {
        // create a full-screen canvas and attach it to the html
        this.canvasElement = document.getElementById("canvas") as HTMLCanvasElement;
        if (!this.canvasElement) {
            throw new Error("Canvas element not found or is not a valid HTMLCanvasElement");
        }
        this.canvasElement!.width = window.innerWidth;
        this.canvasElement!.height = window.innerHeight;

        // create a WebGL2 context and initialize the canvas
        this.webglCanvas = new Canvas(this.canvasElement);
        this.gl = this.webglCanvas.gl;

        // amimir honk shooo
        await new Promise((resolve) => setTimeout(resolve, 200));

        this.brush = new Brush(this.gl);

        const { vao, program } = createFullscreenQuad(this.gl);
        this.screenVAO = vao;
        this.screenProgram = program;


        // attach html event handlers
        attachEventListeners();

        // initial clear and redraw
        AppContext.redrawAll();
    }

    static startDrawing(x: number, y: number) {
        this.drawing = true;
        const pos = { x, y };
        this.currentLine = new Line(pos, this.brush.color);
    }

    static continueDrawing(x: number, y: number) {
        if (!this.drawing || !this.currentLine) return;

        const pos = { x, y };
        this.currentLine.addPoint(pos);

        this.brush.drawIncremental(this.currentLine, this.webglCanvas);

        this.redrawScreen();
    }

    static finalizeCurrentLine() {
        this.drawing = false;

        if (this.currentLine) {
            this.lines.push(this.currentLine);
            this.currentLine = null;
        }
    }

    static redrawScreen() {
        this.webglCanvas.redrawScreen();
    }

    static redrawAll() {
        this.webglCanvas.clear();

        for (const line of this.lines) {
            // Simply draw each line - scissor will be determined automatically
            this.brush.draw(line, this.webglCanvas);
        }
        this.redrawScreen();
    }

    static resizeCanvas(width: number, height: number) {
        this.canvasElement.width = width;
        this.canvasElement.height = height;
        this.webglCanvas.resize(width, height);
        this.webglCanvas.clear();
        this.redrawAll();
    }

    static changeBrushColor(color: [number, number, number, number]) {
        if (this.drawing) return; // Don't change color while drawing
        this.brush.setColor(color);
    }

}