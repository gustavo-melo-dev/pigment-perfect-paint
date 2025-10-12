import type { Canvas } from "../canvas/Canvas";
import { Line, type Point } from "../Line";
import { BRUSH_VERTEX_SHADER, BRUSH_FRAGMENT_SHADER, COPY_VERTEX_SHADER, COPY_FRAGMENT_SHADER } from "./shaders";
import { createProgram, createTextureFromImage, bindTexture, enableScissorBasedOnPosition, samplePointsAlongPath } from "../webgl/webglUtils";
import mixbox from 'mixbox';
import { AppContext } from "../AppContext";

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
    private ibo: WebGLBuffer;
    // private brushTexCoordVbo: WebGLBuffer;

    private positionAttribLocation: GLint;
    // private brushTexCoordAttribLocation: GLint;
    private colorUniformLocation: WebGLUniformLocation;
    private previousTextureUniformLocation: WebGLUniformLocation;
    private brushTextureUniformLocation: WebGLUniformLocation;

    private copyProgram: WebGLProgram; // program used for blitting previous texture
    private copyPreviousTextureUniformLocation: WebGLUniformLocation;
    private copyVao: WebGLVertexArrayObject; // empty VAO for gl_VertexID based fullscreen triangle

    private brushTexture: WebGLTexture; // the brush texture

    private u_translate: WebGLUniformLocation;

    public color: [number, number, number, number]; // the RGBA color that is loaded in the brush
    public size: number; // the size of the brush
    public brushOpacity: number = 1.0; // the opacity of the brush (0-1)
    public flow: number = 0.1; // brush flow (0-1)
    public spacing: number = 0.01; // spacing between stamps 
    private useMixbox: boolean = true; // Whether to use MIXBOX or RGB lerping


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
        size = 40 // Default size of 4 * 10
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
        // this.brushTexCoordAttribLocation = 1;

        // Initialize uniform locations for the new shader structure
        // We'll assign dummy uniform locations to maintain compatibility
        // with the rest of the code, but these will not be used directly
        this.colorUniformLocation = gl.getUniformLocation(this.program, "color")!;
        this.previousTextureUniformLocation = gl.getUniformLocation(this.program, "layer_stroke_texture")!;
        this.brushTextureUniformLocation = gl.getUniformLocation(this.program, "mask_texture")!;
        this.u_translate = gl.getUniformLocation(this.program, "u_translate")!;

        // Check only the essential uniforms
        if (!this.colorUniformLocation || !this.previousTextureUniformLocation || !this.brushTextureUniformLocation) {
            throw new Error("failed to get uniform locations");
        }

        this.vao = gl.createVertexArray()!;
        this.vbo = gl.createBuffer()!;
        this.ibo = gl.createBuffer()!;
        // this.brushTexCoordVbo = gl.createBuffer()!;
        this.copyVao = gl.createVertexArray()!;

        gl.bindVertexArray(this.vao);

        // Position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.enableVertexAttribArray(this.positionAttribLocation);
        gl.vertexAttribPointer(this.positionAttribLocation, 2, gl.FLOAT, false, 0, 0);


        // Index buffer
        const quadIdx = new Uint16Array([0, 1, 2, 1, 3, 2]);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW);

        // Brush texture coordinate attribute
        // gl.bindBuffer(gl.ARRAY_BUFFER, this.brushTexCoordVbo);
        // gl.enableVertexAttribArray(this.brushTexCoordAttribLocation);
        // gl.vertexAttribPointer(this.brushTexCoordAttribLocation, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        // Load brush texture
        const texture = createTextureFromImage(this.gl, "brush.png");
        this.brushTexture = texture;

        // Set initial mixing mode
        this.setMixingMode(this.useMixbox);
    }

    /**
     * Draws only the new part of a line that hasn't been drawn yet.
     * This allows for real-time drawing with self-interaction but without over-accumulation.
     *
     * @param {Line} line - Line to draw incrementally.
     * @param {Canvas} canvas - The canvas to sample the texture colors from.
     */
    drawIncremental(line: Line, canvas: Canvas): void {

        const newPoints = line.getNewPoints();

        if (newPoints.length < 4) {
            return;
        }

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
     * Now draws to BOTH mixbox and RGB canvases simultaneously.
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

        // Use first point for brush center
        const firstPoint = line.points[0];
        enableScissorBasedOnPosition(gl, firstPoint.x, firstPoint.y, AppContext.canvasElement);

        // Build smoothed centerline
        // const resolution = 20;
        // const smoothedPoints: { x: number, y: number }[] = [];
        // const points = [line.points[0], ...line.points, line.points[line.points.length - 1]];
        // for (let i = 0; i < points.length - 3; i++) {
        //     const p0 = points[i];
        //     const p1 = points[i + 1];
        //     const p2 = points[i + 2];
        //     const p3 = points[i + 3];
        //     for (let j = 0; j < resolution; j++) {
        //         const t = j / resolution;
        //         smoothedPoints.push(Line.catmullRom(p0, p1, p2, p3, t));
        //     }
        // }
        // if (smoothedPoints.length < 2) return;

        // // Compute arc lengths along the smoothed path
        // const arcLengths: number[] = [0];
        // for (let i = 1; i < smoothedPoints.length; i++) {
        //     const dx = smoothedPoints[i].x - smoothedPoints[i - 1].x;
        //     const dy = smoothedPoints[i].y - smoothedPoints[i - 1].y;
        //     arcLengths.push(arcLengths[arcLengths.length - 1] + Math.hypot(dx, dy));
        // }
        // const totalLength = arcLengths[arcLengths.length - 1];

        // // Sample stamp positions at regular spacing intervals
        // const stamps: Array<{ x: number; y: number; }> = [];

        // for (let distance = 0; distance <= totalLength; distance += 1) {
        //     // Find which segment this distance falls into
        //     let idx = 0;
        //     while (idx < arcLengths.length - 1 && arcLengths[idx + 1] < distance) {
        //         idx++;
        //     }

        //     // Interpolate position within the segment
        //     const segLen = arcLengths[idx + 1] - arcLengths[idx];
        //     const t = segLen === 0 ? 0 : (distance - arcLengths[idx]) / segLen;
        //     const x = smoothedPoints[idx].x * (1 - t) + smoothedPoints[idx + 1].x * t;
        //     const y = smoothedPoints[idx].y * (1 - t) + smoothedPoints[idx + 1].y * t;

        //     stamps.push({ x, y });
        // }


        // Generate quads for each stamp
        // const stripVerts: number[] = [];
        // const brushTexCoords: number[] = [];

        // // Track cumulative distance for texture stamping
        // let cumulativeDistance = 0;
        // const textureRepeatDistance = this.size * 0.25; // Repeat texture every ~25% of brush size

        // for (let i = 0; i < smoothedPoints.length - 1; i++) {
        //     const p0 = smoothedPoints[i];
        //     const p1 = smoothedPoints[i + 1];
        //     let dx = p1.x - p0.x;
        //     let dy = p1.y - p0.y;
        //     const len = Math.hypot(dx, dy);
        //     if (len === 0) continue;
        //     dx /= len; dy /= len;

        //     // perpendicular for quad
        //     const nx = -dy * (this.size / 2);
        //     const ny = dx * (this.size / 2);

        //     const stampsInSegment = Math.floor(len / textureRepeatDistance);
        //     for (let s = 0; s < stampsInSegment; s++) {
        //         const t = (s * textureRepeatDistance) / len;
        //         const cx = p0.x + dx * len * t;
        //         const cy = p0.y + dy * len * t;

        //         // Full-size quad centered at (cx, cy)
        //         stripVerts.push(
        //             cx - nx, cy - ny,   // top-left
        //             cx + nx, cy - ny,   // top-right
        //             cx + nx, cy + ny,   // bottom-right
        //             cx - nx, cy + ny    // bottom-left
        //         );

        //         // Texture coordinates per quad
        //         brushTexCoords.push(
        //             0, 0,   // top-left
        //             1, 0,   // top-right
        //             1, 1,   // bottom-right
        //             0, 1    // bottom-left
        //         );
        //     }
        // }

        // Advance ping-pong (shared between both canvases)
        let stamps = samplePointsAlongPath(line.points, this.spacing * this.size);
        canvas.advancePingPong();

        // Draw to BOTH canvases: mixbox and RGB
        const modes: ('mixbox' | 'rgb')[] = ['mixbox', 'rgb'];

        for (const mode of modes) {
            const prevTex = canvas.getPreviousTexture(mode);
            const destFbo = canvas.getActiveFramebuffer(mode);

            gl.bindFramebuffer(gl.FRAMEBUFFER, destFbo);
            gl.viewport(0, 0, canvasWidth, canvasHeight);

            // Copy previous texture
            gl.disable(gl.SCISSOR_TEST);
            gl.useProgram(this.copyProgram);
            gl.bindVertexArray(this.copyVao);
            bindTexture(gl, prevTex, 0);
            gl.uniform1i(this.copyPreviousTextureUniformLocation, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Draw stroke with appropriate mixing mode
            enableScissorBasedOnPosition(gl, firstPoint.x, firstPoint.y, AppContext.canvasElement);
            gl.useProgram(this.program);

            // Set new uniforms for the shader
            // Set both fragment and vertex shader uniforms
            gl.uniform1f(gl.getUniformLocation(this.program, "layer_width"), canvasWidth);
            gl.uniform1f(gl.getUniformLocation(this.program, "layer_height"), canvasHeight);

            // Fragment shader specific uniforms
            gl.uniform1f(gl.getUniformLocation(this.program, "size"), this.size);
            gl.uniform1f(gl.getUniformLocation(this.program, "opacity"), this.brushOpacity);
            gl.uniform1f(gl.getUniformLocation(this.program, "flow"), this.flow);

            gl.uniform3fv(gl.getUniformLocation(this.program, "color"), [line.color[0], line.color[1], line.color[2]]);
            gl.uniform1f(gl.getUniformLocation(this.program, "mask_width"), 1024);
            gl.uniform1f(gl.getUniformLocation(this.program, "mask_height"), 1024);

            // Set mix_mode based on which canvas we're rendering to
            gl.uniform1i(gl.getUniformLocation(this.program, "mix_mode"), mode === 'mixbox' ? 0 : 1);

            // Bind textures
            bindTexture(gl, this.brushTexture, 0); // mask_texture
            gl.uniform1i(gl.getUniformLocation(this.program, "mask_texture"), 0);

            // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            bindTexture(gl, prevTex, 1); // layer_stroke_texture
            gl.uniform1i(gl.getUniformLocation(this.program, "layer_stroke_texture"), 1);

            bindTexture(gl, mixbox.lutTexture(gl), 2);
            gl.uniform1i(gl.getUniformLocation(this.program, "mixbox_lut"), 2);


            gl.bindVertexArray(this.vao);

            // Create a quad with size of the brush
            // Positions are vertex position (not including texture coords since we calculate them in shader)
            const halfSize = this.size / 2;
            const quadVerts = new Float32Array([
                -halfSize, -halfSize,  // bottom-left
                halfSize, -halfSize,   // bottom-right
                -halfSize, halfSize,   // top-left
                halfSize, halfSize     // top-right
            ]);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
            gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STREAM_DRAW);

            // Index buffer (already bound to VAO but update data)
            const quadIdx = new Uint16Array([0, 1, 2, 1, 3, 2]);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW);


            for (const s of stamps) {
                this.drawQuadAt(gl, s);
            }

            // Check for WebGL errors
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                console.error("WebGL error occurred:", error);
            }
        }

        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.SCISSOR_TEST);
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
        gl.uniform3fv(this.colorUniformLocation, [color[0], color[1], color[2]]);
        gl.uniform1f(gl.getUniformLocation(this.program, "opacity"), this.brushOpacity);
    }

    /**
     * Sets the opacity of the brush (0-1)
     */
    public setOpacity(opacity: number) {
        this.brushOpacity = Math.max(0, Math.min(1, opacity));

        // Immediately update the opacity uniform in the shader
        const gl = this.gl;
        gl.useProgram(this.program);

        // Update the opacity uniform in the shader
        const opacityLocation = gl.getUniformLocation(this.program, "opacity");
        if (opacityLocation) {
            gl.uniform1f(opacityLocation, this.brushOpacity);
        }
    }

    /**
     * Sets the size of the brush
     * 
     * @public
     * @param {number} size - The new size of the brush
     */
    public setSize(size: number) {
        this.size = Math.max(1, size);
    }

    /**
     * Sets the brush flow value
     * 
     * @public
     * @param {number} flow - Flow value between 0 and 1
     */
    public setFlow(flow: number) {
        this.flow = Math.max(0, Math.min(1, flow));
        const gl = this.gl;
        gl.useProgram(this.program);
        // Use the explicit flow value if set, otherwise calculate from opacity
        const flowValue = this.flow;
        const flowLocation = gl.getUniformLocation(this.program, "flow");
        if (flowLocation) {
            gl.uniform1f(flowLocation, flowValue);
        }
    }

    /**
     * Sets the mixing mode (MIXBOX or RGB)
     * 
     * @public
     * @param {boolean} useMixbox - Whether to use MIXBOX (true) or RGB (false)
     */
    public setMixingMode(useMixbox: boolean) {
        this.useMixbox = useMixbox;
        // Update the uniform in the shader program
        const gl = this.gl;
        gl.useProgram(this.program);
        const mixModeLocation = gl.getUniformLocation(this.program, "mix_mode");
        if (mixModeLocation) {
            // In the new shader: MIXMODE_MIXBOX = 0, MIXMODE_RGB = 1
            gl.uniform1i(mixModeLocation, useMixbox ? 0 : 1);
        }
    }

    private drawQuadAt(gl: WebGLRenderingContext, p: Point) {
        gl.uniform2f(this.u_translate, p.x * (window.devicePixelRatio || 1), p.y * (window.devicePixelRatio || 1));

        // Generate a random seed for this stamp
        const randomSeed = Math.random() * 1000.0;
        const randomSeedLocation = gl.getUniformLocation(this.program, "u_randomSeed");
        if (randomSeedLocation) {
            gl.uniform1f(randomSeedLocation, randomSeed);
        }

        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
}
