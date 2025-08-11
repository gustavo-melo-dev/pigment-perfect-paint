// Utility functions for WebGL operations

export function createProgram(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string): WebGLProgram {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
        throw new Error("Failed to compile shaders.");
    }

    const program = gl.createProgram();
    if (!program) {
        throw new Error("Failed to create WebGL program.");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const errorLog = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Failed to link program: ${errorLog}`);
    }

    return program;
}

export function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) {
        throw new Error("Failed to create shader.");
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const errorLog = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Failed to compile shader: ${errorLog}`);
    }

    return shader;
}

export function createTexture(gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture {
    const texture = gl.createTexture();
    if (!texture) {
        throw new Error("Failed to create texture.");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}

export function createTextureFromImage(gl: WebGLRenderingContext, imageSource: string): WebGLTexture {
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
    image.src = imageSource;
    image.addEventListener("load", () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        // Set texture parameters for proper sampling
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        console.log("texture " + imageSource + " loaded successfully");
    });

    return texture;
}

export function bindTexture(gl: WebGLRenderingContext, texture: WebGLTexture, unit: number): void {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
}

export function createBuffer(gl: WebGLRenderingContext, data: Float32Array, target: number = gl.ARRAY_BUFFER, usage: number = gl.STATIC_DRAW): WebGLBuffer {
    const buffer = gl.createBuffer();
    if (!buffer) {
        throw new Error("Failed to create buffer.");
    }

    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, usage);
    gl.bindBuffer(target, null);

    return buffer;
}
