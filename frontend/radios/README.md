# Radio Players

This directory contains various internet radio players that can be embedded into the Radio Aggregator application.

## Directory Structure

```
radios/
├── README.md                    # This file
└── nirkam/                      # Nirkam synchronized radio player
    ├── README.md                # Nirkam documentation
    ├── embed.html               # Embedded player UI
    ├── index.html               # Fallback/standalone page
    ├── css/
    │   └── style.css            # Player styles
    ├── js/
    │   ├── app.js               # Main application logic
    │   ├── embed-mode.js        # Embedded player mode
    │   ├── playlist.js          # Playlist management
    │   └── prayer-times.js      # Prayer times (optional)
    └── music/
        ├── 01.mp3               # Track 1 (529 seconds)
        ├── 02.mp3               # Track 2 (371 seconds)
        └── 03.mp3               # Track 3 (268 seconds)
```

## Adding New Radio Players

To add a new radio player:

1. Create a new folder under `radios/` with the player name: `radios/{player-name}/`
2. Add your player files (HTML, CSS, JS, assets) to that folder
3. Create an `embed.html` file for iframe embedding
4. Update `data/stations.json` to reference the new player:

```json
{
  "id": "your-player-id",
  "name": "Your Player Name",
  "streams": [{
    "url": "./radios/{player-name}/embed.html",
    "type": "web-player"
  }],
  "website": "./radios/{player-name}/",
  ...
}
```

5. The player's relative paths should use `./` to reference local assets

## Integration with Radio Aggregator

Web-player stations are embedded via `<iframe>` from their `embed.html` files. The parent Radio Aggregator application can communicate with embedded players via the `syncRadioAPI` JavaScript interface.

### API Example

```javascript
// Inside embed.html (or included script)
window.syncRadioAPI = {
  play: () => { /* start playback */ },
  pause: () => { /* pause playback */ },
  getStatus: () => { /* return player status */ },
  getNowPlaying: () => { /* return current track */ }
}
```

The parent window can access this API:

```javascript
const iframe = document.getElementById('webPlayerFrame');
if (iframe.contentWindow.syncRadioAPI) {
  iframe.contentWindow.syncRadioAPI.play();
}
```

## Nirkam Player

See [nirkam/README.md](./nirkam/README.md) for details about the Nirkam synchronized radio player.

## Development

- Use relative paths (`./music/`, `./js/`, etc.) for all local assets
- Paths are relative to each player's `embed.html` location
- Test locally: `http://localhost:8080/radios/{player-name}/embed.html`
- Test embedded: `http://localhost:8080/` (search for your station)

## Deployment

All player files are automatically deployed as part of the Radio Aggregator when the site is built and deployed.
