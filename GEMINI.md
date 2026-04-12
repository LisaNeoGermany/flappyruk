# FlappyRuk Foundry VTT Module

## Project Overview

This project is a "Flappy Bird" clone implemented as a module for the Foundry Virtual Tabletop (VTT) platform. The game is titled "FlappyRuk" and features a leaderboard system.

The core game is built with plain JavaScript using the HTML5 Canvas API for rendering. The integration with Foundry VTT is handled by a `FlappyRukApp` class, which creates the game window, manages the leaderboard, and communicates with the game's iframe.

The module is structured as follows:

*   `game/`: Contains the core game logic, assets, and HTML.
    *   `game/index.html`: The main HTML file for the game, which includes the canvas.
    *   `game/main.js`: The JavaScript file containing the entire game logic (physics, rendering, etc.).
    *   `game/style.css`: The stylesheet for the game's HTML page.
    *   `game/assets/`: Contains the image assets for the game.
*   `scripts/`: Contains the JavaScript files for Foundry VTT integration.
    *   `scripts/main.js`: Handles the main integration with Foundry VTT, including setting up the leaderboard and socket listeners.
    *   `scripts/flappyruk.js`: Defines the `FlappyRukApp` class, which is the main application window for the game.
*   `templates/`: Contains the Handlebars templates for the game's UI.
    *   `templates/app.hbs`: The main template for the game window, which includes the start screen and the game iframe.
*   `lang/`: Contains the language files for English and German.
*   `module.json`: The manifest file for the Foundry VTT module, which defines the module's properties and dependencies.

## Building and Running

This is a Foundry VTT module and should be installed in the `modules` directory of your Foundry VTT installation.

There are no specific build steps required. The module can be enabled in Foundry VTT's module settings.

To open the game in Foundry VTT, you can use the following macro:

```javascript
game.modules.get("flappyruk").api.open();
```

## Development Conventions

The project uses modern JavaScript (ES modules) and is structured to separate the core game logic from the Foundry VTT integration.

The code is not formatted with a consistent style, but it is generally well-structured and readable. There are no linters or formatters configured in the project.

There are no tests included in the project.
