import { Line } from "./Line";


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
        // Convert from pixels to normalized device coordinates (NDC)
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;

        // Flip Y to match canvas coordinates (top-left origin)
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    }`;

/**
 * @constant
 * This fragment shader outputs a uniform color for every fragment (pixel) drawn.
 * - u_color: the RGBA color to use for the brush stroke.
 * The output color is set to u_color, allowing for transparency and color control.
 */
const BRUSH_FRAGMENT_SHADER =
    `#version 300 es
    precision highp float;
    out vec4 outColor;

    uniform vec4 u_color;
    void main() {
        outColor = u_color;
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

    private positionAttribLocation: GLint;
    private colorUniformLocation: WebGLUniformLocation;
    private resolutionUniformLocation: WebGLUniformLocation;

    public color: [number, number, number, number];
    public size: number;


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
        size = 8
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
        if (line.points.length < 2) return;

        const verts: number[] = [];
        for (let i = 0; i < line.points.length - 1; i++) {
            // store the current and next point
            const p0 = line.points[i];
            const p1 = line.points[i + 1];

            // calculate the normal vector for the segment
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len === 0) continue;

            // normalize the vector and scale it to half the brush size (each half will be a side of the quad)
            const nx = (-dy / len) * (this.size / 2);
            const ny = (dx / len) * (this.size / 2);

            // quad for each segment, using TRIANGLE_STRIP order:
            verts.push(
                p0.x + nx,
                p0.y + ny,
                p0.x - nx,
                p0.y - ny,
                p1.x + nx,
                p1.y + ny,
                p1.x - nx,
                p1.y - ny
            );
        }

        gl.useProgram(this.program);
        gl.uniform4fv(this.colorUniformLocation, this.color);
        gl.uniform2f(this.resolutionUniformLocation, canvasWidth, canvasHeight);

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 2);
        gl.bindVertexArray(null);
    }
}
