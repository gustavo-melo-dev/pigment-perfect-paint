/**
 * Canvas class for managing a WebGL2 canvas.
 *
 * @export
 * @class Canvas
 * @typedef {Canvas}
 */
export class Canvas {
    readonly canvas: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;

    private framebuffer!: WebGLFramebuffer;
    private framebufferTexture!: WebGLTexture;

    /**
     * Creates a new Canvas instance with a WebGL2 context.
     *
     * @constructor
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("WebGL2 not supported");
        this.gl = gl;

        this.initFramebuffer();
        this.resize(canvas.width, canvas.height);
    }

    /**
     * Initializes the framebuffer and its texture for rendering the canvas.
     */
    private initFramebuffer(): void {
        const gl = this.gl;

        this.framebuffer = gl.createFramebuffer()!;
        this.framebufferTexture = gl.createTexture()!;

        gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.canvas.width,
            this.canvas.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            this.framebufferTexture,
            0
        );

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Resizes the canvas and updates the WebGL viewport and framebuffer texture.
     *
     * @param {number} width 
     * @param {number} height 
     */
    resize(width: number, height: number): void {
        const gl = this.gl;
        this.canvas.width = width;
        this.canvas.height = height;

        gl.viewport(0, 0, width, height);
        gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);

        // Update the texture size to match the new canvas size
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            width,
            height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
        );
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /**
     * Clears the framebuffer.
     */
    clear(): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Draws the framebuffer texture to the screen using a fullscreen quad.
     *
     * @param {WebGLProgram} program - WebGL program to use for rendering.
     * @param {WebGLVertexArrayObject} vao - Vertex array object for the fullscreen quad.
     */
    drawFramebufferToScreen(program: WebGLProgram, vao: WebGLVertexArrayObject) {
        const gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.framebufferTexture);

        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    /**
     * Draws to the framebuffer by executing the provided callback function.
     *
     * @param {() => void} callback - Callback function that contains the drawing logic.
     */
    drawToFramebuffer(callback: () => void): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        callback();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
}
