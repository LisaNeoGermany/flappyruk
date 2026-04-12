# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlappyRuk is a Foundry VTT module (v12+) that provides a Flappy Bird-style minigame with global leaderboard support. Players can use their selected token image as the bird character.

## Architecture

### Module Entry Points
- `scripts/main.js` - Foundry module initialization, socket relay for score submission, GM macro creation
- `scripts/flappyruk.js` - FlappyRukApp Application class (uses legacy Application V1 API)

### Game Files
- `game/main.js` - Canvas-based game loop, physics, rendering
- `game/index.html` - Game container loaded via iframe
- `game/style.css` - Game styling

### Templates
- `templates/app.hbs` - Handlebars template for the Foundry application window

## Key Patterns

### Score Submission Flow
1. Game (`game/main.js`) sends score via `postMessage` to parent window
2. FlappyRukApp receives message and builds payload with token info
3. Score submitted via Foundry socket (`game.socket.emit`)
4. GM receives and saves to world settings
5. If socket fails, falls back to whispered chat message with flags

### Token Integration
Token URL passed via query parameter to iframe. Game draws token image with animated white wings overlay.

### Settings Storage
Leaderboard stored in world settings as `flappyruk.leaderboard` (Array, max 15 entries).

## Module API

```javascript
game.modules.get('flappyruk')?.api?.open()
```

## Notes

- Currently uses legacy Application V1 API - consider migration to ApplicationV2 (see `ApplicationV2-Guide.txt`)
- Game physics scales with score (speedFactor increases after 20 points)
- Music volume controlled via fade functions
