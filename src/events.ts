import { AppContext } from "./AppContext";

/**
 * Pointer down event handler - starts a new line
 */
function canvasPointerDown() {
    return (e: PointerEvent) => {
        e.preventDefault();

        // Convert client coordinates to canvas coordinates
        const canvasElement = AppContext.canvasElement;
        const rect = canvasElement.getBoundingClientRect();
        const scaleX = canvasElement.width / rect.width;
        const scaleY = canvasElement.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        AppContext.startDrawing(x, y);
    };
}

function palettePointerDown() {
    return (e: PointerEvent) => {
        e.preventDefault();

        // Convert client coordinates to canvas coordinates
        const canvasElement = AppContext.canvasElement;
        const rect = canvasElement.getBoundingClientRect();
        const scaleX = canvasElement.width / rect.width;
        const scaleY = canvasElement.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Check if Alt key is pressed
        if (e.altKey) {
            const color = AppContext.webglCanvas.pickColor(x, y);
            if (color) {
                // Convert to brush color format with alpha
                const brushColor: [number, number, number, number] = [color[0], color[1], color[2], 0.3];
                AppContext.changeBrushColor(brushColor);
            }
            return; // Exit early to avoid starting a drawing action
        }

        AppContext.startDrawing(x, y);
    };
}

/**
 * Pointer move event handler - adds points to current line and draws incrementally
 */
function canvasPointerMove() {
    return (e: PointerEvent) => {
        e.preventDefault();
        // Convert client coordinates to canvas coordinates
        const canvasElement = AppContext.canvasElement;
        const rect = canvasElement.getBoundingClientRect();
        const scaleX = canvasElement.width / rect.width;
        const scaleY = canvasElement.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        AppContext.continueDrawing(x, y);
    };
}

/**
 * Pointer up event handler - finalizes the current line
 */
function canvasPointerUp() {
    return () => {
        AppContext.finalizeCurrentLine();
    };
}

/**
 * Pointer out event handler - stops drawing when the mouse leaves the canvas designated areas
 */
function canvasPointerOut() {
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
 * Keydown event handler - handle keyboard shortcuts
 */
function windowKeydown() {
    return (e: KeyboardEvent) => {
        // Prevent Alt key from opening browser menu bar
        if (e.altKey) {
            e.preventDefault();
        }
        if (e.key === 'Alt') {
            e.preventDefault();
            return;
        }
        // Prevent default browser zoom behavior
        if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')) {
            e.preventDefault();
            return;
        }
        // Prevent opening the console
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
            e.preventDefault();
            return;
        }
        if (e.key === 'F12') {
            e.preventDefault();
            return;
        }
    };
}

/**
 * Keyup event handler - prevent Alt from triggering menu
 */
function windowKeyup() {
    return (e: KeyboardEvent) => {
        // Prevent Alt key from opening browser menu bar
        if (e.key === 'Alt' || e.altKey) {
            e.preventDefault();
        }
    };
}

/**
 * Wheel event handler - prevents zoom
 */
function windowWheel() {
    return (e: WheelEvent) => {
        // Prevent zoom when Ctrl is held (or Cmd on Mac)
        if (e.ctrlKey) {
            e.preventDefault();
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
 * Right-click event handler for canvas - prevents context menu
 */
function canvasRightClick() {
    return (e: MouseEvent) => {
        e.preventDefault();
    };
}

/**
 * Attaches all event listeners to their respective elements
 */
export function attachEventListeners() {
    // window
    window.addEventListener("resize", windowResize());
    window.addEventListener("keydown", windowKeydown());
    window.addEventListener("keyup", windowKeyup());
    window.addEventListener("wheel", windowWheel(), { passive: false });

    // canvas
    const canvasAreaElement = document.getElementById("canvas-area") as HTMLDivElement;
    canvasAreaElement.addEventListener("pointerdown", canvasPointerDown());
    canvasAreaElement.addEventListener("pointermove", canvasPointerMove());
    canvasAreaElement.addEventListener("pointerup", canvasPointerUp());
    canvasAreaElement.addEventListener("pointerout", canvasPointerOut());
    canvasAreaElement.addEventListener("contextmenu", canvasRightClick());

    // palette
    const paletteElement = document.getElementById("palette-area") as HTMLDivElement;
    paletteElement.addEventListener("pointerdown", palettePointerDown());
    paletteElement.addEventListener("pointermove", canvasPointerMove());
    paletteElement.addEventListener("pointerup", canvasPointerUp());
    paletteElement.addEventListener("pointerout", canvasPointerOut());

    // Add right-click and alt+click color picking to palette area
    paletteElement.addEventListener("contextmenu", paletteRightClick());
}
