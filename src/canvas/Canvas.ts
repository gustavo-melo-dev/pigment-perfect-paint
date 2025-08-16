import { bindTexture } from "../webgl/webglUtils";
import { Background } from "./Background";
import { AppContext } from "../AppContext";
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

    // Replace single framebuffer with two for ping-pong rendering
    private framebuffers!: WebGLFramebuffer[];
    private textures!: WebGLTexture[];

    // Background handling
    private background!: Background;

    public activeIndex: number = 0; // index we will sample FROM after a stroke is drawn into the other

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

        // Enable blending for transparency accumulation
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Initialize background
        this.background = new Background(gl, "canvas.jpg");
        this.initFramebuffers();
        this.resize(canvas.width, canvas.height);
    }

    /**
     * Initializes the framebuffer and its texture for rendering the canvas.
     */
    private initFramebuffers(): void {
        const gl = this.gl;
        this.textures = [gl.createTexture()!, gl.createTexture()!];
        this.framebuffers = [gl.createFramebuffer()!, gl.createFramebuffer()!];

        for (let i = 0; i < 2; i++) {
            gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures[i], 0);

            this.background.render();
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Accessors for ping-pong
    public getActiveTexture(): WebGLTexture { return this.textures[this.activeIndex]; }
    public getPreviousTexture(): WebGLTexture { return this.textures[1 - this.activeIndex]; }
    public getActiveFramebuffer(): WebGLFramebuffer { return this.framebuffers[this.activeIndex]; }
    public getInactiveFramebuffer(): WebGLFramebuffer { return this.framebuffers[1 - this.activeIndex]; }
    public getInactiveTexture(): WebGLTexture { return this.textures[1 - this.activeIndex]; }
    public advancePingPong(): void { this.activeIndex = 1 - this.activeIndex; }

    /**
     * Resizes the canvas and updates the WebGL viewport and framebuffer texture.
     *
     * @param {number} width 
     * @param {number} height 
     */
    public resize(width: number, height: number): void {
        const gl = this.gl;
        this.canvas.width = width;
        this.canvas.height = height;
        gl.viewport(0, 0, width, height);
        for (let i = 0; i < 2; i++) {
            gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
            this.background.render();
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /**
     * Clears the framebuffer by rendering the background.
     */
    public clear(): void {
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
            this.background.render();
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Draws the framebuffer texture to the screen using a fullscreen quad.
     *
     * @param {WebGLProgram} program - WebGL program to use for rendering.
     * @param {WebGLVertexArrayObject} VAO - Vertex array object for the fullscreen quad.
     */
    public drawFramebufferToScreen(program: WebGLProgram, VAO: WebGLVertexArrayObject) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        bindTexture(gl, this.getActiveTexture(), 0);
        gl.bindVertexArray(VAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    /** Draws the framebuffer to the screen.
     *  Used when a new line is drawn.
     */
    public redrawScreen(): void {
        this.drawFramebufferToScreen(AppContext.screenProgram, AppContext.screenVAO);
    }

    /** Redraws ALL lines on the WebGL canvas. 
     *  Used after the canvas is resized.
     */
    public redrawAll(): void {
        this.clear();

        for (const line of AppContext.lines) {
            AppContext.brush.draw(line, this);
        }
        this.redrawScreen();
    }

}
