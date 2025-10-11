import { AppContext } from './AppContext.js';

/**
 * Update the current color indicator to show the brush's actual color
 */
export function updateColorIndicator() {
    const currentColorIndicator = document.getElementById('current-color-indicator');
    if (currentColorIndicator && AppContext.brush) {
        const color = AppContext.brush.color;
        // Convert from 0-1 to 0-255
        const r = Math.round(color[0] * 255);
        const g = Math.round(color[1] * 255);
        const b = Math.round(color[2] * 255);
        currentColorIndicator.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    }
}

/**
 * Setup brush opacity slider functionality
 */
function setBrushSliders() {
    // Opacity slider
    const opacitySlider = document.getElementById('brush-opacity') as HTMLInputElement;
    const opacityValue = document.getElementById('brush-opacity-value') as HTMLElement;
    if (opacitySlider && opacityValue) {
        // Ensure the slider starts at 100
        opacitySlider.value = "100";
        opacityValue.textContent = "100";

        // Set initial brush opacity to 100%
        AppContext.brush.setOpacity(1.0);

        // Add the event listener for when the user changes the slider
        opacitySlider.addEventListener('input', () => {
            const value = Number(opacitySlider.value);
            opacityValue.textContent = value.toString();
            // Set brush opacity (0-1)
            AppContext.brush.setOpacity(value / 100);
        });
    }

    // Flow slider
    const flowSlider = document.getElementById('brush-flow') as HTMLInputElement;
    const flowValue = document.getElementById('brush-flow-value') as HTMLElement;
    if (flowSlider && flowValue) {
        // Set initial values to match default of 0.34
        flowSlider.value = "0.34";
        flowValue.textContent = "0.34";
        AppContext.setBrushFlow(0.34);

        flowSlider.addEventListener('input', () => {
            const value = Number(flowSlider.value);
            flowValue.textContent = value.toFixed(2);
            AppContext.setBrushFlow(value);
        });
    }
}

/**
 * Setup brush size buttons functionality
 */
function setupBrushSizeButtons() {
    const brushSizeButtons = document.querySelectorAll('.brush-size-btn');
    let activeButton: HTMLElement | null = null;

    function setBrushSize(size: number, button: HTMLElement) {
        // Set the brush size using the setter method, multiplying the UI value by 6
        AppContext.brush.setSize(size * 6);

        // Update UI - remove active class from previous button and add to current
        if (activeButton) {
            activeButton.classList.remove('active');
        }
        button.classList.add('active');
        activeButton = button;
    }

    // Set up event listeners for brush size buttons
    brushSizeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.currentTarget as HTMLElement;
            const size = Number(button.getAttribute('data-size'));
            if (!isNaN(size)) {
                setBrushSize(size, button);
            }
        });
    });

    // Set initial brush size - find default button (size 4)
    const defaultSizeButton = document.querySelector('.brush-size-btn[data-size="4"]') as HTMLElement;
    if (defaultSizeButton) {
        setBrushSize(4, defaultSizeButton);
    }
}

/**
 * Setup color palette functionality
 */
function setupColorPalette() {
    const colorSwatches = document.querySelectorAll('.color-swatch');
    let activeColor: HTMLElement | null = null;
    const pigmentLabelText = document.getElementById('pigment-label-text');

    function setActiveColor(colorElement: HTMLElement) {
        // Remove active class from previous color
        if (activeColor) {
            activeColor.classList.remove('active');
        }

        // Add active class to current color
        colorElement.classList.add('active');
        activeColor = colorElement;

        // Get color data and set it on the brush
        const colorData = colorElement.getAttribute('data-color');
        if (colorData) {
            const colorValues = colorData.split(',').map(s => s.trim());
            let r, g, b;

            // Check if the values are already in normalized format (0-1)
            if (colorValues.some(val => val.includes('.'))) {
                // If values contain decimals, assume they're already normalized (0-1)
                [r, g, b] = colorValues.map(Number);
            } else {
                // Otherwise convert from 0-255 to 0-1
                [r, g, b] = colorValues.map(val => Number(val) / 255);
            }

            // Use the current opacity instead of the one defined in the color
            AppContext.changeBrushColor([r, g, b, AppContext.brush.brushOpacity]);

            // Update the color indicator to reflect the actual brush color
            updateColorIndicator();
        }
    }

    // Update the label with the color name
    function updateLabelWithColorName(colorElement: HTMLElement) {
        const colorName = colorElement.getAttribute('data-name');
        if (pigmentLabelText && colorName) {
            pigmentLabelText.textContent = colorName;
        }
    }

    // Clear the label
    function clearLabel() {
        if (pigmentLabelText) {
            pigmentLabelText.textContent = "";
        }
    }

    // Add click event listeners to color swatches
    colorSwatches.forEach(swatch => {
        // Click to select the color
        swatch.addEventListener('click', (e) => {
            const colorElement = e.currentTarget as HTMLElement;
            setActiveColor(colorElement);
        });

        // Hover to show color name in label
        swatch.addEventListener('mouseenter', (e) => {
            const colorElement = e.currentTarget as HTMLElement;
            updateLabelWithColorName(colorElement);
        });

        // When mouse leaves, clear the label
        swatch.addEventListener('mouseleave', () => {
            clearLabel();
        });
    });

    // Set initial color to Cobalt Blue
    const defaultColorSwatch = document.querySelector('.color-swatch[data-color="50,61,164"]') as HTMLElement;
    if (defaultColorSwatch) {
        setActiveColor(defaultColorSwatch);
        // Ensure label is blank at startup
        clearLabel();
    }
}

/**
 * Setup mixing mode toggle functionality
 */
function setupMixingModeToggle() {
    const mixingModeToggle = document.getElementById('mixing-mode-toggle') as HTMLButtonElement;
    if (mixingModeToggle) {
        mixingModeToggle.addEventListener('click', () => {
            // Toggle the display mode (instant visual switch)
            AppContext.toggleDisplayMode();

            // Update the button text and style
            const currentMode = AppContext.webglCanvas.displayMode;
            if (currentMode === 'mixbox') {
                mixingModeToggle.textContent = 'MIXBOX';
                mixingModeToggle.classList.add('active');
                mixingModeToggle.setAttribute('data-mode', 'mixbox');
            } else {
                mixingModeToggle.textContent = 'RGB';
                mixingModeToggle.classList.remove('active');
                mixingModeToggle.setAttribute('data-mode', 'rgb');
            }
        });
    }
}

export function setupUIElements() {
    setBrushSliders();
    setupBrushSizeButtons();
    setupColorPalette();
    setupMixingModeToggle();
    // Set initial color indicator
    updateColorIndicator();
}