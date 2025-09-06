import { AppContext } from "./AppContext";

/**
 * Mouse down event handler - starts a new line
 */
function canvasMouseDown() {
    return (e: MouseEvent) => {
        e.preventDefault();
        AppContext.startDrawing(e.clientX, e.clientY);
    };
}

/**
 * Mouse move event handler - adds points to current line and draws incrementally
 */
function canvasMouseMove() {
    return (e: MouseEvent) => {
        e.preventDefault();
        AppContext.continueDrawing(e.clientX, e.clientY);
    };
}

/**
 * Mouse up event handler - finalizes the current line
 */
function canvasMouseUp() {
    return () => {
        AppContext.finalizeCurrentLine();
    };
}

/**
 * Mouse out event handler - stops drawing when the mouse leaves the canvas designated areas
 */
function canvasMouseOut() {
    return () => {
        AppContext.finalizeCurrentLine();
    };
}

/**
 * Resize event handler - updates canvas size and redraws
 */
function windowResize() {
    return () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        AppContext.resizeCanvas(w, h);
    };
}


/**
 * Keydown event handler - changes brush color
 */
export function windowKeydown() {
    return (e: KeyboardEvent) => {
        const colorMap: { [key: string]: [number, number, number, number] } = {
            'r': [1, 0, 0, 1],
            'y': [1, 1, 0, 1],
            'b': [0, 0, 1, 1],
        };

        if (colorMap[e.key.toLowerCase()]) {
            AppContext.changeBrushColor(colorMap[e.key.toLowerCase()]);
        }
    };
}

/**
 * Right-click event handler - picks color from palette area
 */
function paletteRightClick() {
    return (e: MouseEvent) => {
        e.preventDefault();

        // Get canvas coordinates
        const canvasElement = document.querySelector("canvas") as HTMLCanvasElement;
        const rect = canvasElement.getBoundingClientRect();

        // Convert to canvas coordinates
        const scaleX = canvasElement.width / rect.width;
        const scaleY = canvasElement.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Pick the color at this position
        const color = AppContext.webglCanvas.pickColor(x, y);
        if (color) {
            // Convert to brush color format with alpha
            const brushColor: [number, number, number, number] = [color[0], color[1], color[2], 0.3];
            AppContext.changeBrushColor(brushColor);
        }
    };
}

/**
 * Attaches all event listeners to their respective elements
 */
export function attachEventListeners() {
    // window
    window.addEventListener("resize", windowResize());
    window.addEventListener("keydown", windowKeydown());

    // canvas
    const canvasAreaElement = document.getElementById("canvas-area") as HTMLDivElement;
    canvasAreaElement.addEventListener("mousedown", canvasMouseDown());
    canvasAreaElement.addEventListener("mousemove", canvasMouseMove());
    canvasAreaElement.addEventListener("mouseup", canvasMouseUp());
    canvasAreaElement.addEventListener("mouseout", canvasMouseOut());

    // palette
    const paletteElement = document.getElementById("palette-area") as HTMLDivElement;
    paletteElement.addEventListener("mousedown", canvasMouseDown());
    paletteElement.addEventListener("mousemove", canvasMouseMove());
    paletteElement.addEventListener("mouseup", canvasMouseUp());
    paletteElement.addEventListener("mouseout", canvasMouseOut());

    // Add right-click color picking to palette area
    paletteElement.addEventListener("contextmenu", paletteRightClick());

    window.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "pen") {
            console.log("Pen down", e.pressure, e.tiltX, e.tiltY);
        }
    });
}
