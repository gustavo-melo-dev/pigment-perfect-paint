import { AppContext } from "../AppContext";
import { createProgram, bindTexture, createTextureFromImage, enableScissorForElement, disableScissor } from "../webgl/webglUtils";
import { BACKGROUND_VERTEX_SHADER, BACKGROUND_FRAGMENT_SHADER } from "./shaders";

/**
 * Background class for managing background texture rendering.
 * Handles loading, opacity control, and rendering of the canvas background.
 */
export class Background {
    private gl: WebGL2RenderingContext;
    private texture: WebGLTexture;
    private program!: WebGLProgram;
    private vao!: WebGLVertexArrayObject;
    private textureUniformLocation!: WebGLUniformLocation;
    private opacityUniformLocation!: WebGLUniformLocation;

    public opacity: number = 0.5;

    /**
     * Creates a new Background instance.
     * @param gl - WebGL2 rendering context
     * @param imagePath - Path to the background image
     */
    constructor(gl: WebGL2RenderingContext, imagePath: string) {
        this.gl = gl;

        // Load background texture
        const backgroundTexture = createTextureFromImage(gl, imagePath);
        if (!backgroundTexture) {
            throw new Error("Failed to load background texture");
        }
        this.texture = backgroundTexture;

        // Initialize shaders
        this.initShaders();
    }

    /**
     * Initializes the background shader program and VAO.
     */
    private initShaders(): void {
        const gl = this.gl;

        const program = createProgram(gl, BACKGROUND_VERTEX_SHADER, BACKGROUND_FRAGMENT_SHADER);
        if (!program) {
            throw new Error("Failed to create background shader program");
        }
        this.program = program;

        // Get uniform locations
        this.textureUniformLocation = gl.getUniformLocation(this.program, "u_backgroundTexture")!;
        this.opacityUniformLocation = gl.getUniformLocation(this.program, "u_opacity")!;

        if (!this.textureUniformLocation || !this.opacityUniformLocation) {
            throw new Error("Failed to get background shader uniform locations");
        }

        // Create VAO (no vertex buffer needed since we use gl_VertexID)
        this.vao = gl.createVertexArray()!;
    }

    /**
     * Renders the background texture to the current framebuffer for a specific layer.
     * @param layer - The layer to render ('canvas' or 'palette')
     */
    public render(layer: 'canvas' | 'palette'): void {
        const elementId = layer === 'canvas' ? 'canvas-area' : 'palette-area';
        const element = document.getElementById(elementId) as HTMLDivElement;

        if (element) {
            enableScissorForElement(this.gl, AppContext.canvasElement, element);
            this.renderArea();
            disableScissor(this.gl);
        }
    }

    private renderArea(): void {
        const gl = this.gl;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Bind background texture using utility function
        bindTexture(gl, this.texture, 0);
        gl.uniform1i(this.textureUniformLocation, 0);

        // Set opacity uniform
        gl.uniform1f(this.opacityUniformLocation, this.opacity);

        // Render fullscreen quad
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindVertexArray(null);
    }
    /**
     * Cleanup method to dispose of WebGL resources.
     */
    public dispose(): void {
        const gl = this.gl;
        if (this.texture) {
            gl.deleteTexture(this.texture);
        }
        if (this.program) {
            gl.deleteProgram(this.program);
        }
        if (this.vao) {
            gl.deleteVertexArray(this.vao);
        }
    }
}