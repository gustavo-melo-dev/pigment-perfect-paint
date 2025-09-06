import { AppContext } from "./AppContext";

await AppContext.initialize();

// Brush opacity slider logic
const opacitySlider = document.getElementById('brush-opacity') as HTMLInputElement;
const opacityValue = document.getElementById('brush-opacity-value') as HTMLElement;
if (opacitySlider && opacityValue) {
    // Ensure the slider starts at 40
    opacitySlider.value = "40";
    opacityValue.textContent = "40";

    // Set initial brush opacity to 40%
    AppContext.brush.setOpacity(0.4);    // Add the event listener for when the user changes the slider
    opacitySlider.addEventListener('input', () => {
        const value = Number(opacitySlider.value);
        opacityValue.textContent = value.toString();
        // Set brush opacity (0-1)
        AppContext.brush.setOpacity(value / 100);
    });
}

// Brush size buttons logic
const brushSizeButtons = document.querySelectorAll('.brush-size-btn');
let activeButton: HTMLElement | null = null;

function setBrushSize(size: number, button: HTMLElement) {
    // Set the brush size using the setter method, multiplying the UI value by 10
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

// Color palette logic
const colorSwatches = document.querySelectorAll('.color-swatch');
let activeColor: HTMLElement | null = null;
const pigmentLabel = document.getElementById('pigment-label');

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
    }
}

// Update the label with the color name
function updateLabelWithColorName(colorElement: HTMLElement) {
    const colorName = colorElement.getAttribute('data-name');
    if (pigmentLabel && colorName) {
        pigmentLabel.textContent = colorName;
    }
}

// Clear the label
function clearLabel() {
    if (pigmentLabel) {
        pigmentLabel.textContent = "";
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

// Set initial color to black (now that we've added it to the palette)
const defaultColorSwatch = document.querySelector('.color-swatch[data-color="50,61,164"]') as HTMLElement;
if (defaultColorSwatch) {
    setActiveColor(defaultColorSwatch);
    // Ensure label is blank at startup
    clearLabel();
}

// Mixing mode toggle logic
const mixingModeToggle = document.getElementById('mixing-mode-toggle') as HTMLButtonElement;
if (mixingModeToggle) {
    mixingModeToggle.addEventListener('click', () => {
        // Toggle the mode
        AppContext.toggleMixingMode();

        // Update the button text and style
        if (AppContext.useMixbox) {
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