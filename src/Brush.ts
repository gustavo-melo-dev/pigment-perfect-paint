import { Line } from "./Line";
import mixbox from 'mixbox';


/**
 * @constant
 * This vertex shader transforms 2D canvas coordinates into clip space for WebGL rendering.
 * - a_position: the input vertex position in pixel coordinates.
 * - u_resolution: the canvas resolution (width, height).
 * The shader normalizes the position to [0,1], then to [-1,1] (clip space),
 * and flips the y-axis so that (0,0) is at the top-left (matching canvas coordinates).
 *
 */
const BRUSH_VERTEX_SHADER = `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 a_position;
    uniform vec2 u_resolution;

    void main() {
        // convert from pixels to normalized device coordinates (NDC)
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;

        // flip Y to match canvas coordinates (top-left origin)
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    }`;

/**
 * This fragment shader outputs a uniform color for every fragment (pixel) drawn.
 * - u_color: the RGBA color to use for the brush stroke.
 * The output color is set to u_color, allowing for transparency and color control.
 */
let BRUSH_FRAGMENT_SHADER =
    `#version 300 es
    
    precision highp float;
    out vec4 outColor;
    uniform vec4 u_color;

    // uncomment the following line if you work in linear space
    // #define MIXBOX_COLORSPACE_LINEAR

    uniform sampler2D mixbox_lut; // bind mixbox.lutTexture(gl) here

    #include "mixbox.glsl"

    void main() {
        // u_color is the color of the line
        // this color is cast to vec3
        // and mixed with yellow at a ratio of 0.4 for testing purposes

        // need to change to use the color of the line and figure a way to get the color already in the canvas
        // and then lerp them both together
        
        vec3 y = vec3(0.988, 0.827, 0); // warm yellow
        vec3 my_color = vec3(u_color.r, u_color.g, u_color.b);
        float t = 0.6; // mixing ratio

        vec3 rgb = mixbox_lerp(my_color, y, t);

        outColor = vec4(rgb, 1.0);
    }`;
BRUSH_FRAGMENT_SHADER = BRUSH_FRAGMENT_SHADER.replace('#include "mixbox.glsl"', mixbox.glsl());

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

    private positionAttribLocation: GLint;
    private colorUniformLocation: WebGLUniformLocation;
    private resolutionUniformLocation: WebGLUniformLocation;

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
        size = 30
    ) {
        this.gl = gl;
        this.color = color;
        this.size = size;

        const vs = BRUSH_VERTEX_SHADER;
        const fs = BRUSH_FRAGMENT_SHADER;

        this.program = this.createProgram(vs, fs);
        this.positionAttribLocation = 0;
        this.colorUniformLocation = gl.getUniformLocation(this.program, "u_color")!;
        this.resolutionUniformLocation = gl.getUniformLocation(
            this.program,
            "u_resolution"
        )!;

        this.vao = gl.createVertexArray()!;
        this.vbo = gl.createBuffer()!;

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.enableVertexAttribArray(this.positionAttribLocation);
        gl.vertexAttribPointer(this.positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
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
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw new Error(gl.getProgramInfoLog(program)!);

        return program;
    }

    /**
     * Draws a line on the canvas using the brush.
     * The brush draws a quad for each segment of the line.
     *
     * @param {Line} line - Line to draw, containing an array of points.
     * @param {number} canvasWidth - Width of the canvas.
     * @param {number} canvasHeight - Height of the canvas.
     */
    draw(line: Line, canvasWidth: number, canvasHeight: number) {
        const gl = this.gl;
        if (line.points.length < 4) return;

        const verts: number[] = [];

        const resolution = 10; // Number of samples per segment
        const smoothedPoints: { x: number, y: number }[] = [];

        // Pad endpoints if needed (repeat first and last points)
        const points = [
            line.points[0],
            ...line.points,
            line.points[line.points.length - 1]
        ];

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

        // Generate quad geometry from smoothed points
        for (let i = 0; i < smoothedPoints.length - 1; i++) {
            const p0 = smoothedPoints[i];
            const p1 = smoothedPoints[i + 1];

            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) continue;

            const nx = (-dy / len) * (this.size / 2);
            const ny = (dx / len) * (this.size / 2);

            verts.push(
                p0.x + nx, p0.y + ny,
                p0.x - nx, p0.y - ny,
                p1.x + nx, p1.y + ny,
                p1.x - nx, p1.y - ny
            );
        }

        gl.useProgram(this.program);

        // mixbox setup
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mixbox.lutTexture(gl));
        gl.uniform1i(gl.getUniformLocation(this.program, "mixbox_lut"), 0);

        gl.uniform4fv(this.colorUniformLocation, line.color);
        gl.uniform2f(this.resolutionUniformLocation, canvasWidth, canvasHeight);

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 2);
        gl.bindVertexArray(null);
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
