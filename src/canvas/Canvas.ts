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

    // Layer-based dual canvas system
    // Each layer (canvas/palette) has both mixbox and RGB framebuffers
    // Each framebuffer has a ping-pong pair for self-interaction
    private canvasLayerMixboxFramebuffers!: WebGLFramebuffer[];
    private canvasLayerMixboxTextures!: WebGLTexture[];
    private canvasLayerRgbFramebuffers!: WebGLFramebuffer[];
    private canvasLayerRgbTextures!: WebGLTexture[];

    private paletteLayerMixboxFramebuffers!: WebGLFramebuffer[];
    private paletteLayerMixboxTextures!: WebGLTexture[];
    private paletteLayerRgbFramebuffers!: WebGLFramebuffer[];
    private paletteLayerRgbTextures!: WebGLTexture[];

    // Background handling
    private background!: Background;

    public activeIndex: number = 0; // index we will sample FROM after a stroke is drawn into the other
    public displayMode: 'mixbox' | 'rgb' = 'mixbox'; // Which canvas to display

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
     * Initializes the framebuffers and textures for layer-based dual-canvas rendering.
     * Creates separate ping-pong pairs for canvas and palette layers, each with mixbox and RGB modes.
     */
    private initFramebuffers(): void {
        const gl = this.gl;

        // Initialize canvas layer
        this.canvasLayerMixboxTextures = [gl.createTexture()!, gl.createTexture()!];
        this.canvasLayerMixboxFramebuffers = [gl.createFramebuffer()!, gl.createFramebuffer()!];
        this.canvasLayerRgbTextures = [gl.createTexture()!, gl.createTexture()!];
        this.canvasLayerRgbFramebuffers = [gl.createFramebuffer()!, gl.createFramebuffer()!];

        // Initialize palette layer
        this.paletteLayerMixboxTextures = [gl.createTexture()!, gl.createTexture()!];
        this.paletteLayerMixboxFramebuffers = [gl.createFramebuffer()!, gl.createFramebuffer()!];
        this.paletteLayerRgbTextures = [gl.createTexture()!, gl.createTexture()!];
        this.paletteLayerRgbFramebuffers = [gl.createFramebuffer()!, gl.createFramebuffer()!];

        // Setup all layer pairs
        const layers = [
            {
                name: 'canvas-mixbox',
                textures: this.canvasLayerMixboxTextures,
                framebuffers: this.canvasLayerMixboxFramebuffers
            },
            {
                name: 'canvas-rgb',
                textures: this.canvasLayerRgbTextures,
                framebuffers: this.canvasLayerRgbFramebuffers
            },
            {
                name: 'palette-mixbox',
                textures: this.paletteLayerMixboxTextures,
                framebuffers: this.paletteLayerMixboxFramebuffers
            },
            {
                name: 'palette-rgb',
                textures: this.paletteLayerRgbTextures,
                framebuffers: this.paletteLayerRgbFramebuffers
            }
        ];

        for (const layer of layers) {
            for (let i = 0; i < 2; i++) {
                gl.bindTexture(gl.TEXTURE_2D, layer.textures[i]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffers[i]);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.textures[i], 0);

                // Clear to transparent first
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                // Render background to the appropriate layer
                if (layer.name.startsWith('canvas')) {
                    this.background.render('canvas');
                } else if (layer.name.startsWith('palette')) {
                    this.background.render('palette');
                }
            }
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }    // Accessors for ping-pong - now returns the appropriate layer and mode
    public getActiveTexture(mode?: 'mixbox' | 'rgb', layer?: 'canvas' | 'palette'): WebGLTexture {
        const actualMode = mode || this.displayMode;
        const actualLayer = layer || 'canvas';

        let textures: WebGLTexture[];
        if (actualLayer === 'canvas') {
            textures = actualMode === 'mixbox' ? this.canvasLayerMixboxTextures : this.canvasLayerRgbTextures;
        } else {
            textures = actualMode === 'mixbox' ? this.paletteLayerMixboxTextures : this.paletteLayerRgbTextures;
        }
        return textures[this.activeIndex];
    }

    public getPreviousTexture(mode?: 'mixbox' | 'rgb', layer?: 'canvas' | 'palette'): WebGLTexture {
        const actualMode = mode || this.displayMode;
        const actualLayer = layer || 'canvas';

        let textures: WebGLTexture[];
        if (actualLayer === 'canvas') {
            textures = actualMode === 'mixbox' ? this.canvasLayerMixboxTextures : this.canvasLayerRgbTextures;
        } else {
            textures = actualMode === 'mixbox' ? this.paletteLayerMixboxTextures : this.paletteLayerRgbTextures;
        }
        return textures[1 - this.activeIndex];
    }

    public getActiveFramebuffer(mode?: 'mixbox' | 'rgb', layer?: 'canvas' | 'palette'): WebGLFramebuffer {
        const actualMode = mode || this.displayMode;
        const actualLayer = layer || 'canvas';

        let framebuffers: WebGLFramebuffer[];
        if (actualLayer === 'canvas') {
            framebuffers = actualMode === 'mixbox' ? this.canvasLayerMixboxFramebuffers : this.canvasLayerRgbFramebuffers;
        } else {
            framebuffers = actualMode === 'mixbox' ? this.paletteLayerMixboxFramebuffers : this.paletteLayerRgbFramebuffers;
        }
        return framebuffers[this.activeIndex];
    }

    public getInactiveFramebuffer(mode?: 'mixbox' | 'rgb', layer?: 'canvas' | 'palette'): WebGLFramebuffer {
        const actualMode = mode || this.displayMode;
        const actualLayer = layer || 'canvas';

        let framebuffers: WebGLFramebuffer[];
        if (actualLayer === 'canvas') {
            framebuffers = actualMode === 'mixbox' ? this.canvasLayerMixboxFramebuffers : this.canvasLayerRgbFramebuffers;
        } else {
            framebuffers = actualMode === 'mixbox' ? this.paletteLayerMixboxFramebuffers : this.paletteLayerRgbFramebuffers;
        }
        return framebuffers[1 - this.activeIndex];
    }

    public getInactiveTexture(mode?: 'mixbox' | 'rgb', layer?: 'canvas' | 'palette'): WebGLTexture {
        const actualMode = mode || this.displayMode;
        const actualLayer = layer || 'canvas';

        let textures: WebGLTexture[];
        if (actualLayer === 'canvas') {
            textures = actualMode === 'mixbox' ? this.canvasLayerMixboxTextures : this.canvasLayerRgbTextures;
        } else {
            textures = actualMode === 'mixbox' ? this.paletteLayerMixboxTextures : this.paletteLayerRgbTextures;
        }
        return textures[1 - this.activeIndex];
    }

    public advancePingPong(): void { this.activeIndex = 1 - this.activeIndex; }

    // Toggle between mixbox and RGB display
    public toggleDisplayMode(): void {
        this.displayMode = this.displayMode === 'mixbox' ? 'rgb' : 'mixbox';
        this.redrawScreen();
    }

    public setDisplayMode(mode: 'mixbox' | 'rgb'): void {
        this.displayMode = mode;
        this.redrawScreen();
    }

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

        // Resize all layer pairs
        const layers = [
            {
                name: 'canvas-mixbox',
                textures: this.canvasLayerMixboxTextures,
                framebuffers: this.canvasLayerMixboxFramebuffers
            },
            {
                name: 'canvas-rgb',
                textures: this.canvasLayerRgbTextures,
                framebuffers: this.canvasLayerRgbFramebuffers
            },
            {
                name: 'palette-mixbox',
                textures: this.paletteLayerMixboxTextures,
                framebuffers: this.paletteLayerMixboxFramebuffers
            },
            {
                name: 'palette-rgb',
                textures: this.paletteLayerRgbTextures,
                framebuffers: this.paletteLayerRgbFramebuffers
            }
        ];

        for (const layer of layers) {
            for (let i = 0; i < 2; i++) {
                gl.bindTexture(gl.TEXTURE_2D, layer.textures[i]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffers[i]);

                // clear to transparent
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                // Render background to the appropriate layer
                if (layer.name.startsWith('canvas')) {
                    this.background.render('canvas');
                } else if (layer.name.startsWith('palette')) {
                    this.background.render('palette');
                }
            }
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /**
     * Clears the framebuffer by rendering the background only in drawable areas.
     */
    public clear(): void {
        const gl = this.gl;

        // Clear all layer pairs
        const layers = [
            {
                name: 'canvas-mixbox',
                textures: this.canvasLayerMixboxTextures,
                framebuffers: this.canvasLayerMixboxFramebuffers
            },
            {
                name: 'canvas-rgb',
                textures: this.canvasLayerRgbTextures,
                framebuffers: this.canvasLayerRgbFramebuffers
            },
            {
                name: 'palette-mixbox',
                textures: this.paletteLayerMixboxTextures,
                framebuffers: this.paletteLayerMixboxFramebuffers
            },
            {
                name: 'palette-rgb',
                textures: this.paletteLayerRgbTextures,
                framebuffers: this.paletteLayerRgbFramebuffers
            }
        ];

        for (const layer of layers) {
            for (let i = 0; i < 2; i++) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffers[i]);

                // clear to transparent
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                // Render background to the appropriate layer
                if (layer.name.startsWith('canvas')) {
                    this.background.render('canvas');
                } else if (layer.name.startsWith('palette')) {
                    this.background.render('palette');
                }
            }
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Clears only the palette layer framebuffers.
     */
    public clearPalette(): void {
        const gl = this.gl;

        const paletteLayers = [
            {
                textures: this.paletteLayerMixboxTextures,
                framebuffers: this.paletteLayerMixboxFramebuffers
            },
            {
                textures: this.paletteLayerRgbTextures,
                framebuffers: this.paletteLayerRgbFramebuffers
            }
        ];

        for (const layer of paletteLayers) {
            for (let i = 0; i < 2; i++) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffers[i]);

                // Clear to transparent
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                // Render background to palette layer
                this.background.render('palette');
            }
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Draws the framebuffer textures to the screen, compositing canvas and palette layers.
     *
     * @param {WebGLProgram} program - WebGL program to use for rendering.
     * @param {WebGLVertexArrayObject} VAO - Vertex array object for the fullscreen quad.
     */
    public drawFramebufferToScreen(program: WebGLProgram, VAO: WebGLVertexArrayObject) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindVertexArray(VAO);

        // Draw canvas layer first
        bindTexture(gl, this.getActiveTexture(this.displayMode, 'canvas'), 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Draw palette layer on top with blending
        bindTexture(gl, this.getActiveTexture(this.displayMode, 'palette'), 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindVertexArray(null);
    }

    /** Draws the framebuffer to the screen.
     *  Used when a new line is drawn.
     */
    public redrawScreen(): void {
        this.drawFramebufferToScreen(AppContext.screenProgram, AppContext.screenVAO);
    }

    /**
     * Picks a color from the canvas at the specified coordinates
     * @param x Canvas x coordinate
     * @param y Canvas y coordinate
     * @returns RGBA color array [r, g, b, a] with values 0-1, or null if outside palette area
     */
    public pickColor(x: number, y: number): [number, number, number, number] | null {
        const gl = this.gl;

        // Check if the point is in the palette area
        const paletteElement = document.getElementById("palette-area") as HTMLDivElement;
        const canvasAreaElement = document.getElementById("canvas-area") as HTMLDivElement;
        if (!paletteElement || !canvasAreaElement) return null;

        const paletteRect = paletteElement.getBoundingClientRect();
        const canvasRect = canvasAreaElement.getBoundingClientRect();
        const canvasElement = this.canvas.getBoundingClientRect();

        // Convert coordinates to check which area the click is in
        const scaleX = this.canvas.width / canvasElement.width;
        const scaleY = this.canvas.height / canvasElement.height;

        const paletteBounds = {
            left: (paletteRect.left - canvasElement.left) * scaleX,
            right: (paletteRect.right - canvasElement.left) * scaleX,
            top: (paletteRect.top - canvasElement.top) * scaleY,
            bottom: (paletteRect.bottom - canvasElement.top) * scaleY
        };

        const canvasBounds = {
            left: (canvasRect.left - canvasElement.left) * scaleX,
            right: (canvasRect.right - canvasElement.left) * scaleX,
            top: (canvasRect.top - canvasElement.top) * scaleY,
            bottom: (canvasRect.bottom - canvasElement.top) * scaleY
        };

        // Determine which layer to sample from
        let layer: 'canvas' | 'palette';
        if (x >= paletteBounds.left && x <= paletteBounds.right &&
            y >= paletteBounds.top && y <= paletteBounds.bottom) {
            layer = 'palette';
        } else if (x >= canvasBounds.left && x <= canvasBounds.right &&
            y >= canvasBounds.top && y <= canvasBounds.bottom) {
            layer = 'canvas';
        } else {
            return null; // Outside both areas
        }

        // Bind the appropriate framebuffer to read from
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.getActiveFramebuffer(this.displayMode, layer));

        // Create a 1x1 pixel buffer to read the color
        const pixels = new Uint8Array(4);

        // Read the pixel at the specified coordinates
        // Note: WebGL coordinates are bottom-left origin, so flip Y
        const webglY = this.canvas.height - y;
        gl.readPixels(Math.floor(x), Math.floor(webglY), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Unbind framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Convert from 0-255 to 0-1 range and return
        return [
            pixels[0] / 255,
            pixels[1] / 255,
            pixels[2] / 255,
            pixels[3] / 255,
        ];
    }

    public downloadCanvasAsImage(): void {
        const gl = this.gl;
        const fullWidth = this.canvas.width;
        const fullHeight = this.canvas.height;

        // Find the DOM element that defines the desired crop area
        const areaEl = document.getElementById('canvas-area') as HTMLElement | null;
        let readX = 0;
        let readY = 0;
        let readW = fullWidth;
        let readH = fullHeight;

        if (areaEl) {
            const areaRect = areaEl.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();

            // convert to canvas pixel coordinates
            const scaleX = fullWidth / canvasRect.width;
            const scaleY = fullHeight / canvasRect.height;

            const left = (areaRect.left - canvasRect.left) * scaleX;
            const top = (areaRect.top - canvasRect.top) * scaleY;
            const w = areaRect.width * scaleX;
            const h = areaRect.height * scaleY;

            // Clamp and ensure integers
            readX = Math.max(0, Math.floor(left));
            readY = Math.max(0, Math.floor(top));
            readW = Math.max(0, Math.floor(w));
            readH = Math.max(0, Math.floor(h));

            // Clamp to canvas bounds
            if (readX + readW > fullWidth) readW = fullWidth - readX;
            if (readY + readH > fullHeight) readH = fullHeight - readY;
        }

        if (readW === 0 || readH === 0) {
            // Nothing to read — fallback to full canvas
            readX = 0; readY = 0; readW = fullWidth; readH = fullHeight;
        }

        // Bind active framebuffer and read the sub-rectangle
        const framebuffer = this.getActiveFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

        // WebGL readPixels expects bottom-left origin for the Y coordinate.
        // We computed readY as distance from top; convert to bottom-based origin.
        const webglReadY = fullHeight - (readY + readH);

        const pixels = new Uint8Array(readW * readH * 4);
        gl.readPixels(readX, webglReadY, readW, readH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Put pixels into an offscreen 2D canvas (flip rows so image is upright)
        const off = document.createElement('canvas');
        off.width = readW;
        off.height = readH;
        const ctx = off.getContext('2d');
        if (!ctx) {
            // Fallback: use visible canvas toDataURL (best-effort)
            const fallback = this.canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = 'canvas-image.png';
            link.href = fallback;
            link.click();
            link.href = '';
            return;
        }

        const imageData = ctx.createImageData(readW, readH);
        const rowBytes = readW * 4;
        for (let y = 0; y < readH; y++) {
            // pixels from readPixels are bottom-to-top for the rectangle, so flip
            const srcStart = (readH - 1 - y) * rowBytes;
            const dstStart = y * rowBytes;
            imageData.data.set(pixels.subarray(srcStart, srcStart + rowBytes), dstStart);
        }
        ctx.putImageData(imageData, 0, 0);

        // Download blob
        off.toBlob((blob) => {
            if (!blob) {
                const fallback = off.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = 'canvas-image.png';
                link.href = fallback;
                link.click();
                link.href = '';
                return;
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'canvas-image.png';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        }, 'image/png');
    }
}
