import { AppContext } from "./AppContext";

// Initialize the application
async function init() {
    await AppContext.initialize();
}

init();