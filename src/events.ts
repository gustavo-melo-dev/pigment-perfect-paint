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
            'r': [1, 0, 0, 0.3],
            'y': [1, 1, 0, 0.3],
            'b': [0, 0, 1, 0.3],
        };

        if (colorMap[e.key.toLowerCase()]) {
            AppContext.changeBrushColor(colorMap[e.key.toLowerCase()]);
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
}
