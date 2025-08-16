import type { Canvas } from "../canvas/Canvas";
import { Line } from "../Line";
import { BRUSH_VERTEX_SHADER, BRUSH_FRAGMENT_SHADER, COPY_VERTEX_SHADER, COPY_FRAGMENT_SHADER } from "./shaders";
import { createProgram, createTextureFromImage, bindTexture } from "../webgl/webglUtils";
import mixbox from 'mixbox';

/**
 * Brush class for drawing lines on a WebGL canvas.
 *
 * @export
 * @class Brush
 * @typedef {Brush}
 */
export class Brush {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private vbo: WebGLBuffer;
    private brushTexCoordVbo: WebGLBuffer;

    private positionAttribLocation: GLint;
    private brushTexCoordAttribLocation: GLint;
    private colorUniformLocation: WebGLUniformLocation;
    private previousTextureUniformLocation: WebGLUniformLocation;
    private brushTextureUniformLocation: WebGLUniformLocation;
    private resolutionUniformLocation: WebGLUniformLocation;

    private copyProgram: WebGLProgram; // program used for blitting previous texture
    private copyPreviousTextureUniformLocation: WebGLUniformLocation;
    private copyVao: WebGLVertexArrayObject; // empty VAO for gl_VertexID based fullscreen triangle

    private brushTexture: WebGLTexture; // the brush texture

    public color: [number, number, number, number]; // the RGBA color that is loaded in the brush
    public size: number; // the size of the brush


    /**
     * Creates a new Brush instance. 
     * Creates a WebGL program to draw lines with a specified color and size.
     *
     * @constructor
     * @param {WebGL2RenderingContext} gl - WebGL2 rendering context to use for drawing.
     * @param {[number, number, number, number]} [color=[1, 0, 0, 0.3]] - Color of the brush.
     * @param {number} [size=8] - Size of the brush.
     */
    constructor(
        gl: WebGL2RenderingContext,
        color: [number, number, number, number] = [0, 0, 0, 1],
        size = 50
    ) {
        this.gl = gl;
        this.color = color;
        this.size = size;

        const vs = BRUSH_VERTEX_SHADER;
        const fs = BRUSH_FRAGMENT_SHADER;

        const program = createProgram(gl, vs, fs);
        this.program = program;

        // create copy/blit program
        this.copyProgram = createProgram(gl, COPY_VERTEX_SHADER, COPY_FRAGMENT_SHADER);
        this.copyPreviousTextureUniformLocation = gl.getUniformLocation(this.copyProgram, "u_src")!;

        this.positionAttribLocation = 0;
        this.brushTexCoordAttribLocation = 1;

        this.colorUniformLocation = gl.getUniformLocation(this.program, "u_color")!;
        this.resolutionUniformLocation = gl.getUniformLocation(this.program, "u_resolution")!;
        this.previousTextureUniformLocation = gl.getUniformLocation(this.program, "u_previousTexture")!;
        this.brushTextureUniformLocation = gl.getUniformLocation(this.program, "u_brushTexture")!;

        if (!this.colorUniformLocation || !this.resolutionUniformLocation || !this.previousTextureUniformLocation || !this.brushTextureUniformLocation) {
            throw new Error("failed to get uniform locations");
        }

        this.vao = gl.createVertexArray()!;
        this.vbo = gl.createBuffer()!;
        this.brushTexCoordVbo = gl.createBuffer()!;
        this.copyVao = gl.createVertexArray()!;

        gl.bindVertexArray(this.vao);

        // Position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.enableVertexAttribArray(this.positionAttribLocation);
        gl.vertexAttribPointer(this.positionAttribLocation, 2, gl.FLOAT, false, 0, 0);

        // Brush texture coordinate attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.brushTexCoordVbo);
        gl.enableVertexAttribArray(this.brushTexCoordAttribLocation);
        gl.vertexAttribPointer(this.brushTexCoordAttribLocation, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        // Load brush texture
        const texture = createTextureFromImage(this.gl, "brush.png");
        this.brushTexture = texture;
    }

    /**
     * Draws only the new part of a line that hasn't been drawn yet.
     * This allows for real-time drawing with self-interaction but without over-accumulation.
     *
     * @param {Line} line - Line to draw incrementally.
     * @param {number} canvasWidth - Width of the canvas.
     * @param {number} canvasHeight - Height of the canvas.
     * @param {Canvas} canvas - The canvas to sample the texture colors from.
     */
    drawIncremental(line: Line, canvas: Canvas): void {
        const newPoints = line.getNewPoints();
        if (newPoints.length < 4) return;

        // Create a temporary line with just the new points to draw
        const tempLine = new Line(newPoints[0], line.color);
        tempLine.points = newPoints;

        // Draw the incremental part
        this.draw(tempLine, canvas);

        // Mark the line as drawn up to this point
        line.markAsDrawn();
    }

    /**
     * Draws a line on the canvas using the brush.
     * The brush draws a quad for each segment of the line.
     *
     * @param {Line} line - Line to draw, containing an array of points.
     * @param {number} canvasWidth - Width of the canvas.
     * @param {number} canvasHeight - Height of the canvas.
     * @param {Canvas} canvas - The canvas to sample the texture colors from.
     */
    draw(line: Line, canvas: Canvas): void {
        const gl = this.gl;
        const canvasWidth = canvas.canvas.width;
        const canvasHeight = canvas.canvas.height;
        if (line.points.length < 4) return;

        // Build smoothed centerline
        const resolution = 10; // samples per spline segment
        const smoothedPoints: { x: number, y: number }[] = [];
        const points = [line.points[0], ...line.points, line.points[line.points.length - 1]];
        for (let i = 0; i < points.length - 3; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const p2 = points[i + 2];
            const p3 = points[i + 3];
            for (let j = 0; j < resolution; j++) {
                const t = j / resolution;
                smoothedPoints.push(Line.catmullRom(p0, p1, p2, p3, t));
            }
        }
        if (smoothedPoints.length < 2) return;

        // Generate a triangle strip: for first segment push p0+ / p0-, then for each subsequent segment push p1+ / p1-
        const stripVerts: number[] = [];
        const brushTexCoords: number[] = [];

        // Track cumulative distance for texture stamping
        let cumulativeDistance = 0;
        const textureRepeatDistance = this.size * 0.25; // Repeat texture every ~25% of brush size

        for (let i = 0; i < smoothedPoints.length - 1; i++) {
            const p0 = smoothedPoints[i];
            const p1 = smoothedPoints[i + 1];
            let dx = p1.x - p0.x;
            let dy = p1.y - p0.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) continue;
            dx /= len; dy /= len;
            const nx = -dy * (this.size / 2);
            const ny = dx * (this.size / 2);

            if (i === 0) {
                // first pair for initial point
                stripVerts.push(p0.x + nx, p0.y + ny, p0.x - nx, p0.y - ny);
                // Texture coordinates: across width (0 to 1), along length based on distance
                const texV = (cumulativeDistance / textureRepeatDistance) % 1.0;
                brushTexCoords.push(0, texV, 1, texV);
            }

            // Update cumulative distance
            cumulativeDistance += len;

            // pair for next point
            stripVerts.push(p1.x + nx, p1.y + ny, p1.x - nx, p1.y - ny);
            const texV = (cumulativeDistance / textureRepeatDistance) % 1.0;
            brushTexCoords.push(0, texV, 1, texV);
        }

        // 1) Advance ping-pong so we render into the new (destination) buffer
        canvas.advancePingPong();
        const prevTex = canvas.getPreviousTexture();
        const destFbo = canvas.getActiveFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, destFbo);

        // reset viewport to full canvas size for framebuffer rendering
        gl.viewport(0, 0, canvasWidth, canvasHeight);

        // 2) Copy previous texture into destination
        gl.useProgram(this.copyProgram);
        gl.bindVertexArray(this.copyVao);
        bindTexture(gl, prevTex, 0);
        gl.uniform1i(this.copyPreviousTextureUniformLocation, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 3) Draw new stroke over accumulated content
        gl.useProgram(this.program);

        // Bind previous texture
        bindTexture(gl, prevTex, 0);
        gl.uniform1i(this.previousTextureUniformLocation, 0);

        // Bind mixbox LUT
        bindTexture(gl, mixbox.lutTexture(gl), 1);
        gl.uniform1i(gl.getUniformLocation(this.program, "mixbox_lut"), 1);

        // Bind brush texture
        bindTexture(gl, this.brushTexture, 2);
        gl.uniform1i(this.brushTextureUniformLocation, 2);

        gl.uniform4fv(this.colorUniformLocation, line.color);
        gl.uniform2f(this.resolutionUniformLocation, canvasWidth, canvasHeight); gl.bindVertexArray(this.vao);

        // Upload position data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stripVerts), gl.STREAM_DRAW);

        // Upload brush texture coordinate data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.brushTexCoordVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(brushTexCoords), gl.STREAM_DRAW);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, stripVerts.length / 2);
        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Sets the color of the brush.
     *
     * @public
     * @param {[number, number, number, number]} color 
     */
    public setColor(color: [number, number, number, number]) {
        this.color = color;
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform4fv(this.colorUniformLocation, this.color);
    }
}
