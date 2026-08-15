# Nirkam Radio Player

A synchronized internet radio player embedded in the Radio Aggregator application.

## Structure

```
radios/nirkam/
├── README.md           - This file
├── embed.html          - Embedded player UI
├── index.html          - Fallback page
├── css/
│   └── style.css       - Player styles
├── js/
│   ├── app.js          - Main application logic
│   ├── embed-mode.js   - Embedded player mode
│   ├── playlist.js     - Playlist management
│   └── prayer-times.js - Prayer times (optional)
└── music/
    ├── 01.mp3          - Track 1 (529 seconds)
    ├── 02.mp3          - Track 2 (371 seconds)
    └── 03.mp3          - Track 3 (268 seconds)
```

## Features

- 🌍 **Global UTC Synchronization** - All listeners hear the same song at the same moment
- 🎵 **Auto-play in iframe** - Embedded player starts automatically
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🎚️ **Volume Control** - Adjust playback volume
- ⏱️ **Live Status** - Shows current uptime and listener info
- 🔄 **Playlist Cycling** - Continuous playback of 3 tracks

## Usage

### Embedded in Radio Aggregator

The player is embedded via iframe from the Radio Aggregator:

```html
<iframe src="./radios/nirkam/embed.html"></iframe>
```

### Direct Access

You can also access the player directly:
- Local: `http://localhost:8080/radios/nirkam/embed.html`
- Production: `https://radio.rathore.club/radios/nirkam/embed.html`

## Audio Tracks

All audio files are stored in the `music/` folder:

| Track | File | Duration |
|-------|------|----------|
| Track 1 | 01.mp3 | 529 seconds (8:49) |
| Track 2 | 02.mp3 | 371 seconds (6:11) |
| Track 3 | 03.mp3 | 268 seconds (4:28) |

**Total Cycle:** ~1168 seconds (~19:28)

## Synchronization

The player calculates the current track based on UTC time:

1. All listeners sync to the same global time
2. Current position is calculated from playlist cycle
3. Everyone hears the same track at the same position
4. Perfect synchronization across all devices

## Development

### Local Testing

Open the player locally:
```
http://localhost:8080/radios/nirkam/embed.html
```

Or embedded in the Radio Aggregator:
```
http://localhost:8080/
Search for "Nirkam" → Click to play
```

### File Paths

- Music files use **relative paths**: `./music/01.mp3`
- Works from any location: `/radios/embed.html`
- Compatible with GitHub Pages deployment

## Deployment

Deployed as part of the Radio Aggregator on Cloudflare Pages:
- Repository: `proj-02-radio`
- Live URL: `https://radio.rathore.club/`
- Radio Player: `https://radio.rathore.club/radios/nirkam/embed.html`

## Integration with Radio Aggregator

In `data/stations.json`:

```json
{
  "id": "667add4e-3e14-49bf-a314-8415b893c0bc",
  "name": "🎵 Nirkam",
  "streams": [{
    "url": "./radios/nirkam/embed.html",
    "type": "web-player"
  }],
  "metadata": {
    "sync_type": "UTC-based",
    "all_listeners_synchronized": true
  }
}
```

## Technical Details

### Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support (with autoplay policy considerations)

### CORS

No CORS issues since the radio player is on the same domain as the Radio Aggregator.

### Performance

- Lightweight (< 50KB without audio files)
- No external dependencies
- Responsive and smooth
- Efficient audio streaming

## Troubleshooting

### Audio not playing
1. Check browser console (F12) for errors
2. Verify music files exist in `music/` folder
3. Check audio file paths in console
4. Some browsers block autoplay - click the play button

### Iframe not loading
1. Verify relative paths: `./radios/embed.html`
2. Check Same-Origin Policy
3. Ensure radio folder is in the correct location

## License

Part of the Radio Aggregator application.
