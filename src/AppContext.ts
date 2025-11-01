import { Brush } from "./brush/Brush";
import { Canvas } from "./canvas/Canvas";
import { attachEventListeners } from "./events";
import { Line } from "./Line";
import { createFullscreenQuad } from "./webgl/fullscreenQuad";
import { setupUIElements, updateColorIndicator } from "./ui";

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
    static useMixbox: boolean = true; // Default to MIXBOX mode

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

        // set the ui elements
        setupUIElements();

        // attach html event handlers
        attachEventListeners();

        // initial clear and redraw
        AppContext.redrawAll();
    }

    static startDrawing(x: number, y: number) {
        this.drawing = true;
        const pos = { x, y };
        // default to canvas layer unless caller specified otherwise via overload
        this.currentLine = new Line(pos, this.brush.selectedColor, 'canvas');
    }

    // Overload: start drawing on a specific layer (palette | canvas)
    static startDrawingOnLayer(x: number, y: number, layer: 'canvas' | 'palette') {
        this.drawing = true;
        const pos = { x, y };
        this.currentLine = new Line(pos, this.brush.selectedColor, layer);
    }

    static continueDrawing(x: number, y: number) {
        if (!this.drawing || !this.currentLine) return;

        const pos = { x, y };
        this.currentLine.addPoint(pos);

        if (this.currentLine.points.length >= 4) {
            this.brush.drawIncremental(this.currentLine, this.webglCanvas);
            this.redrawScreen();
        }
    }

    static finalizeCurrentLine() {
        this.drawing = false;

        if (this.currentLine) {
            this.lines.push(this.currentLine);
            this.currentLine = null;
        }
    }

    /**
     * Clears the palette layer framebuffers without affecting canvas layer strokes.
     */
    static clearPalette() {
        this.webglCanvas.clearPalette();
        this.redrawScreen();
    }

    static redrawScreen() {
        this.webglCanvas.redrawScreen();
    }

    static redrawAll() {
        this.webglCanvas.clear();

        for (const line of this.lines) {
            // Simulate the incremental drawing process for each line
            // Reset the drawnPointCount to 0 to start fresh
            line.drawnPointCount = 0;

            // Split the line into segments of 4 points each, with 3-point overlaps
            // This mimics the incremental drawing process
            const totalPoints = line.points.length;

            if (totalPoints < 4) {
                // Not enough points for a proper curve, draw directly
                this.brush.draw(line, this.webglCanvas);
                continue;
            }

            // Draw the line incrementally in chunks, similar to how it was originally drawn
            const segmentSize = 4; // Minimum points needed for Catmull-Rom spline
            const step = 1; // Move forward this many points each segment

            for (let i = 0; i + segmentSize <= totalPoints; i += step) {
                // Create a temporary line with just the points for this segment
                const tempLine = new Line(line.points[i], line.color, line.layer);
                tempLine.points = line.points.slice(i, i + segmentSize);

                // Draw this segment
                this.brush.draw(tempLine, this.webglCanvas);

                // Mark these points as drawn in the original line
                line.drawnPointCount = Math.min(i + segmentSize, totalPoints);
            }

            // Ensure any remaining points are drawn
            if (line.drawnPointCount < totalPoints) {
                const tempLine = new Line(line.points[totalPoints - segmentSize], line.color, line.layer);
                tempLine.points = line.points.slice(totalPoints - segmentSize);
                this.brush.draw(tempLine, this.webglCanvas);
                line.drawnPointCount = totalPoints;
            }
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
        // Update the UI color indicator to reflect the new brush color
        updateColorIndicator();
    }

    static toggleDisplayMode() {
        this.webglCanvas.toggleDisplayMode();
    }

    static setBrushFlow(flow: number) {
        if (this.drawing) return;
        this.brush.setFlow(flow);
    }
}