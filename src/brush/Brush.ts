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

    public selectedColor: [number, number, number, number]; // the original selected color
    public currentColorMixbox: [number, number, number, number]; // current color for mixbox mode
    public currentColorRGB: [number, number, number, number]; // current color for RGB mode
    public size: number; // the size of the brush
    public flow: number = 0.30; // brush flow (0-1)
    public spacing: number = 0.1; // spacing between stamps 
    public colorPickupAmount: number = 0.9; // How much canvas color to pick up (0-1)
    public colorReturnRate: number = 0.1; // How quickly to return to selected color (0-1)

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
        this.selectedColor = [...color] as [number, number, number, number]; // Store the original color
        this.currentColorMixbox = [...color] as [number, number, number, number]; // Initialize to selected color
        this.currentColorRGB = [...color] as [number, number, number, number]; // Initialize to selected color
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

        // Advance ping-pong (shared between both canvases)
        let stamps = samplePointsAlongPath(line.points, this.spacing * this.size);
        canvas.advancePingPong();

        // Sample canvas color at the start of the stroke to influence brush color
        this.updateBrushColorFromCanvas(canvas, firstPoint.x, firstPoint.y);

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
            gl.uniform1f(gl.getUniformLocation(this.program, "flow"), this.flow);

            // Use the appropriate currentColor for each mode
            const currentColor = mode === 'mixbox' ? this.currentColorMixbox : this.currentColorRGB;
            gl.uniform3fv(gl.getUniformLocation(this.program, "color"), [currentColor[0], currentColor[1], currentColor[2]]);
            gl.uniform1f(gl.getUniformLocation(this.program, "mask_width"), 1024);
            gl.uniform1f(gl.getUniformLocation(this.program, "mask_height"), 1024);

            // Set mix_mode based on which canvas we're rendering to
            gl.uniform1i(gl.getUniformLocation(this.program, "mix_mode"), mode === 'mixbox' ? 0 : 1);

            // Bind textures
            gl.uniform1i(gl.getUniformLocation(this.program, "layer_stroke_texture"), 0);

            bindTexture(gl, this.brushTexture, 1); // mask_texture
            gl.uniform1i(gl.getUniformLocation(this.program, "mask_texture"), 1);

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


            for (const s of stamps) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
                gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STREAM_DRAW);
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
        this.selectedColor = [...color] as [number, number, number, number]; // Update selected color
        this.currentColorMixbox = [...color] as [number, number, number, number]; // Reset mixbox color to selected
        this.currentColorRGB = [...color] as [number, number, number, number]; // Reset RGB color to selected
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform3fv(this.colorUniformLocation, [color[0], color[1], color[2]]);
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

        const flowValue = this.flow;
        const flowLocation = gl.getUniformLocation(this.program, "flow");
        if (flowLocation) {
            gl.uniform1f(flowLocation, flowValue);
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

    /**
     * Samples the canvas color at a specific point and updates the brush's current colors
     * Updates BOTH mixbox and RGB colors independently by sampling from their respective canvases
     * 
     * @private
     * @param {Canvas} canvas - The canvas to sample from
     * @param {number} x - X coordinate to sample
     * @param {number} y - Y coordinate to sample
     */
    private updateBrushColorFromCanvas(canvas: Canvas, x: number, y: number): void {
        const gl = this.gl;

        // Sample size calculation (same for both modes)
        const sampleSize = Math.max(3, Math.floor(this.size * 0.2)); // Sample ~20% of brush size
        const halfSample = Math.floor(sampleSize / 2);

        // Calculate canvas-space coordinates
        const canvasX = Math.floor(x * (window.devicePixelRatio || 1));
        const canvasY = Math.floor(y * (window.devicePixelRatio || 1));
        const webglY = canvas.canvas.height - canvasY - halfSample; // Flip Y for WebGL

        // Update MIXBOX color by sampling from mixbox canvas
        {
            const prevFramebuffer = canvas.getInactiveFramebuffer('mixbox');
            gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);

            const pixels = new Uint8Array(sampleSize * sampleSize * 4);
            gl.readPixels(
                Math.max(0, canvasX - halfSample),
                Math.max(0, webglY),
                sampleSize,
                sampleSize,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixels
            );

            const sampledColor = this.calculateAverageColor(pixels);
            if (sampledColor) {
                const pickupBlend = this.blendColors(this.currentColorMixbox, sampledColor, this.colorPickupAmount, true);
                this.currentColorMixbox = this.blendColors(pickupBlend, this.selectedColor, this.colorReturnRate, true);
            } else {
                this.currentColorMixbox = this.blendColors(this.currentColorMixbox, this.selectedColor, this.colorReturnRate, true);
            }
        }

        // Update RGB color by sampling from RGB canvas
        {
            const prevFramebuffer = canvas.getInactiveFramebuffer('rgb');
            gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);

            const pixels = new Uint8Array(sampleSize * sampleSize * 4);
            gl.readPixels(
                Math.max(0, canvasX - halfSample),
                Math.max(0, webglY),
                sampleSize,
                sampleSize,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixels
            );

            const sampledColor = this.calculateAverageColor(pixels);
            if (sampledColor) {
                const pickupBlend = this.blendColors(this.currentColorRGB, sampledColor, this.colorPickupAmount, false);
                this.currentColorRGB = this.blendColors(pickupBlend, this.selectedColor, this.colorReturnRate, false);
            } else {
                this.currentColorRGB = this.blendColors(this.currentColorRGB, this.selectedColor, this.colorReturnRate, false);
            }
        }

        // Unbind framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Calculate average color from sampled pixels
     * 
     * @private
     * @param {Uint8Array} pixels - Pixel data
     * @returns {[number, number, number, number] | null} Average color or null if no valid pixels
     */
    private calculateAverageColor(pixels: Uint8Array): [number, number, number, number] | null {
        let r = 0, g = 0, b = 0, a = 0;
        let validPixels = 0;

        for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3] / 255;
            // Only consider pixels with some opacity
            if (alpha > 0.1) {
                r += pixels[i] / 255;
                g += pixels[i + 1] / 255;
                b += pixels[i + 2] / 255;
                a += alpha;
                validPixels++;
            }
        }

        if (validPixels > 0) {
            return [r / validPixels, g / validPixels, b / validPixels, a / validPixels];
        }
        return null;
    }

    /**
     * Blends two colors together using either MIXBOX or RGB blending
     * 
     * @private
     * @param {[number, number, number, number]} colorA - First color (RGBA)
     * @param {[number, number, number, number]} colorB - Second color (RGBA)
     * @param {number} t - Blend amount (0 = all colorA, 1 = all colorB)
     * @param {boolean} useMixbox - Whether to use MIXBOX (true) or RGB (false) blending
     * @returns {[number, number, number, number]} Blended color
     */
    private blendColors(
        colorA: [number, number, number, number],
        colorB: [number, number, number, number],
        t: number,
        useMixbox: boolean
    ): [number, number, number, number] {
        if (useMixbox) {
            // Use MIXBOX for realistic pigment mixing
            const mixboxResult = mixbox.lerp(
                [colorA[0] * 255, colorA[1] * 255, colorA[2] * 255],
                [colorB[0] * 255, colorB[1] * 255, colorB[2] * 255],
                t
            );
            return [
                mixboxResult[0] / 255,
                mixboxResult[1] / 255,
                mixboxResult[2] / 255,
                colorA[3] * (1 - t) + colorB[3] * t
            ];
        } else {
            // Simple RGB lerp
            return [
                colorA[0] * (1 - t) + colorB[0] * t,
                colorA[1] * (1 - t) + colorB[1] * t,
                colorA[2] * (1 - t) + colorB[2] * t,
                colorA[3] * (1 - t) + colorB[3] * t
            ];
        }
    }

    /**
     * Sets the color pickup amount (how much canvas color to pick up)
     * 
     * @public
     * @param {number} amount - Pickup amount between 0 and 1
     */
    public setColorPickupAmount(amount: number) {
        this.colorPickupAmount = Math.max(0, Math.min(1, amount));
    }

    /**
     * Sets the color return rate (how quickly brush returns to selected color)
     * 
     * @public
     * @param {number} rate - Return rate between 0 and 1
     */
    public setColorReturnRate(rate: number) {
        this.colorReturnRate = Math.max(0, Math.min(1, rate));
    }
}
