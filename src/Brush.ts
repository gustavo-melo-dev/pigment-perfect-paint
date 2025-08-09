import type { Canvas } from "./Canvas";
import { Line } from "./Line";
import mixbox from 'mixbox';


/**
 * @constant
 * This vertex shader transforms 2D canvas coordinates into clip space for WebGL rendering.
 * - a_position: the input vertex position in pixel coordinates.
 * - a_brushTexCoord: texture coordinates for the brush texture
 * - u_resolution: the canvas resolution (width, height).
 * The shader normalizes the position to [0,1], then to [-1,1] (clip space),
 * and flips the y-axis so that (0,0) is at the top-left (matching canvas coordinates).
 *
 */
const BRUSH_VERTEX_SHADER = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 a_position;
    layout(location = 1) in vec2 a_brushTexCoord;
    uniform vec2 u_resolution;
    out vec2 v_texCoord; // normalized texture coordinates passed to fragment shader
    out vec2 v_brushTexCoord; // brush texture coordinates

    void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        // Flip Y for texture coords to match the flipped clip-space
        v_texCoord = vec2(zeroToOne.x, 1.0 - zeroToOne.y);
        v_brushTexCoord = a_brushTexCoord;
    }`;

/**
 * This fragment shader outputs a uniform color for every fragment (pixel) drawn.
 * - u_color: the RGBA color to use for the brush stroke.
 * - u_brushTexture: the brush texture to apply
 * The output color is set to u_color, allowing for transparency and color control.
 */
let BRUSH_FRAGMENT_SHADER =
    `#version 300 es
    
    precision highp float;
    uniform vec4 u_color;
    uniform sampler2D u_previousTexture;
    uniform sampler2D u_brushTexture;
    in vec2 v_texCoord; // normalized texture coordinates from vertex shader
    in vec2 v_brushTexCoord; // brush texture coordinates
    out vec4 outColor;

    // uncomment the following line if you work in linear space
    // #define MIXBOX_COLORSPACE_LINEAR

    uniform sampler2D mixbox_lut; // bind mixbox.lutTexture(gl) here

    #include "mixbox.glsl"

    void main() {
        vec4 dstColor = texture(u_previousTexture, v_texCoord);
        vec4 brushTexel = texture(u_brushTexture, v_brushTexCoord);
        
        // Use brush texture alpha as the mixing strength, respecting low alpha values
        float brushStrength = brushTexel.a * u_color.a * 0.15;
        
        // No threshold - smooth blend based on actual brush texture alpha
        vec3 my_color = vec3(u_color.r, u_color.g, u_color.b);
        vec3 canvas_color = vec3(dstColor.r, dstColor.g, dstColor.b);
        
        // Mix colors using mixbox, with the actual brush strength
        vec3 mixedColor = mixbox_lerp(canvas_color, my_color, brushStrength);
        
        // Very gentle opacity accumulation that respects the brush texture alpha
        float newAlpha = dstColor.a + brushStrength * 0.3;
        newAlpha = min(newAlpha, 1.0);
        
        outColor = vec4(mixedColor, newAlpha);
    }`;
BRUSH_FRAGMENT_SHADER = BRUSH_FRAGMENT_SHADER.replace('#include "mixbox.glsl"', mixbox.glsl());

// Simple full-screen copy shaders used to blit the previous texture into the current target
const COPY_VERTEX_SHADER = `#version 300 es
precision highp float;
// Full-screen triangle in clip space
const vec2 pos[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
);
out vec2 v_uv;
void main(){
    gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
    // map clip-space triangle verts into 0-1 UV range
    v_uv = (pos[gl_VertexID]*0.5)+0.5;
}`;

const COPY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_src; // previous texture
in vec2 v_uv;
out vec4 outColor;
void main(){
    outColor = texture(u_src, v_uv);
}`;

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
        color: [number, number, number, number] = [0, 0, 0, 0.3],
        size = 200
    ) {
        this.gl = gl;
        this.color = color;
        this.size = size;

        const vs = BRUSH_VERTEX_SHADER;
        const fs = BRUSH_FRAGMENT_SHADER;

        this.program = this.createProgram(vs, fs);
        // create copy/blit program
        this.copyProgram = this.createProgram(COPY_VERTEX_SHADER, COPY_FRAGMENT_SHADER);
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
        this.copyVao = gl.createVertexArray()!; // empty; uses gl_VertexID

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
        this.brushTexture = this.loadBrushTexture();
    }

    /**
     * Creates a WebGL program with the provided vertex and fragment shader source code.
     * This method is specific for the Brush shader program, which is used to draw lines.
     * 
     * @param {string} vsSource - Source code for the vertex shader.
     * @param {string} fsSource - Source code for the fragment shader.
     * @returns {WebGLProgram} Created WebGL program.
     */
    private createProgram(vsSource: string, fsSource: string): WebGLProgram {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER)!;

        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(vs)!);


        console.log("Fragment shader source:", fsSource);

        const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(fs)!);

        const program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.bindAttribLocation(program, 0, "a_position");
        gl.bindAttribLocation(program, 1, "a_brushTexCoord");
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw new Error(gl.getProgramInfoLog(program)!);

        return program;
    }

    /**
     * Loads the brush texture from the public/brush.png file.
     *
     * @private
     * @returns {WebGLTexture} The loaded brush texture.
     */
    private loadBrushTexture(): WebGLTexture {
        const gl = this.gl;
        const texture = gl.createTexture()!;

        // Create a temporary 1x1 white texture while the image loads
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const level = 0;
        const internalFormat = gl.RGBA;
        const width = 1;
        const height = 1;
        const border = 0;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        const pixel = new Uint8Array([255, 255, 255, 255]);
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixel);

        // Load the actual image
        const image = new Image();
        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

            // Set texture parameters for proper sampling
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        };
        image.src = "brush.png";

        return texture;
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
    drawIncremental(line: Line, canvasWidth: number, canvasHeight: number, canvas: Canvas): void {
        const newPoints = line.getNewPoints();
        if (newPoints.length < 4) return;

        // Create a temporary line with just the new points to draw
        const tempLine = new Line(newPoints[0], line.color);
        tempLine.points = newPoints;

        // Draw the incremental part
        this.draw(tempLine, canvasWidth, canvasHeight, canvas);

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
    draw(line: Line, canvasWidth: number, canvasHeight: number, canvas: Canvas): void {
        const gl = this.gl;
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

        // 2) Copy previous texture into destination
        gl.useProgram(this.copyProgram);
        gl.bindVertexArray(this.copyVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, prevTex);
        gl.uniform1i(this.copyPreviousTextureUniformLocation, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 3) Draw new stroke over accumulated content
        gl.useProgram(this.program);

        // Bind previous texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, prevTex);
        gl.uniform1i(this.previousTextureUniformLocation, 0);

        // Bind mixbox LUT
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mixbox.lutTexture(gl));
        gl.uniform1i(gl.getUniformLocation(this.program, "mixbox_lut"), 1);

        // Bind brush texture
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.brushTexture);
        gl.uniform1i(this.brushTextureUniformLocation, 2);

        gl.uniform4fv(this.colorUniformLocation, line.color);
        gl.uniform2f(this.resolutionUniformLocation, canvasWidth, canvasHeight);

        gl.bindVertexArray(this.vao);

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
