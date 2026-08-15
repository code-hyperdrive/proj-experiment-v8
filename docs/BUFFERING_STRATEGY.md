# Buffering Strategy for Slow & Flickering Internet Connections

## Overview

Radio Explorer now implements comprehensive buffering strategies to handle slow internet speeds and intermittent connectivity. These features ensure continuous playback even on unstable networks.

## Features Implemented

### 1. **Adaptive Buffer Sizing**

Buffer duration automatically adjusts based on detected network speed:

- **4G Networks**: 2 seconds minimum buffer (fast connection)
- **3G Networks**: 3 seconds minimum buffer (normal connection)
- **2G/Slow-2G Networks**: 8 seconds minimum buffer (slow connection)
- **Unknown/LTE Networks**: 3 seconds minimum buffer (default)

**How It Works:**
- Browser's Network Information API detects effective connection type
- Buffer duration updates automatically when network changes
- Longer buffers prevent frequent pauses on slow connections

### 2. **Pre-buffering Before Playback**

On slow connections, audio waits for a minimum buffer before starting playback:

```javascript
// For slow connections (2g, 3g, slow-2g):
await this.waitForBuffer(); // Waits up to 15 seconds for minimum buffer
```

**Benefits:**
- Reduces mid-stream interruptions
- Improves user experience by preventing immediate stalls
- Timeout prevents indefinite waiting (15 seconds max)

### 3. **Real-Time Buffer Monitoring**

Continuous monitoring tracks buffer health:

- Samples buffer status every 1 second during playback
- Logs buffer duration vs. current playback position
- Detects buffer drops and network issues
- Samples slow-connection networks (10% sampling to avoid logs spam)

**Console Output Examples:**
```
📊 Buffer: 4.2s Current: 12.3s Network: 3g
📊 Buffer: 3.8s Current: 15.1s Network: 3g
⚠️ Buffer dropping: 0.5s
```

### 4. **Network Change Detection**

Automatically responds to network changes:

```javascript
// Listens for network changes
navigator.connection.addEventListener('change', () => {
    this.networkInfo = this.detectNetworkInfo();
    this.updateMinBufferDuration();
    console.log('📡 Network change detected:', networkType, 'minBuffer:', duration + 's');
});
```

**How It Works:**
- Detects when user switches between WiFi/4G/3G/2G
- Recalculates buffer duration for new network
- Adapts buffering behavior in real-time

### 5. **Improved Stall Detection**

Faster stall detection with network-aware messaging:

- **Previous**: 5-second timeout before showing message
- **Current**: 3-second timeout (faster feedback)
- Shows actual network type in message: "Buffering (3g network)"

### 6. **Audio Element Configuration**

Updated HTML5 audio element for better buffering:

```html
<audio id="radioPlayer" preload="auto" crossorigin="anonymous"></audio>
```

**Changes:**
- `preload="auto"` instead of `preload="none"`: Browser automatically loads audio data
- `crossorigin="anonymous"`: Enables CORS preflight for streaming resources

### 7. **Buffer Progress Events**

Emits buffer progress for UI updates:

```javascript
this.emit('bufferProgress', {
    bufferedEnd: 42.5,        // Total seconds buffered
    currentTime: 38.2,        // Current playback position
    bufferedDuration: 4.3     // Seconds ahead of playback
});
```

**UI Integration:**
- Can show buffer progress bars
- Display buffered duration to users
- Visual feedback during loading

## Network Information API Integration

### Detected Properties

```javascript
{
    effectiveType: '3g',    // 4g, 3g, 2g, slow-2g
    saveData: false,         // User enabled data-saver mode
    downlink: 2.5,           // Mbps (approximate)
    rtt: 50                  // Round-trip time in milliseconds
}
```

### Usage in Code

```javascript
// Check if connection is slow
if (this.isSlowConnection()) {
    // Increase buffer duration
    // Defer non-critical assets
}

// Get network type
const networkType = navigator.connection.effectiveType;
```

## Buffering Flow

### 1. Load Station

```
User clicks station
    ↓
setState(LOADING)
startBufferMonitoring()
audio.preload="auto" starts buffering
```

### 2. Wait for Playback

```
Browser starts downloading audio
  ↓
progress event fires periodically
  ↓
Check: is buffered >= minBuffer?
  YES → canplay event fires
  NO → waiting event fires (BUFFERING state)
```

### 3. Playing

```
setState(PLAYING)
startBufferMonitoring() tracks buffer every 1s
  ↓
Buffer drops below 50% minBuffer?
  → Warn user: "⚠️ Buffer dropping"
  ↓
Stream ends or network drops?
  → setState(BUFFERING) until recovered
```

### 4. Stall Handling

```
Network stall detected (stalled event)
  ↓
3-second timeout
  ↓
Still buffering? → Show "Buffering (network type)" message
  ↓
canplay event fires when recovered → Automatically resume
```

## Server-Side Recommendations

To complement the client-side buffering:

### 1. **Enable HTTP Compression**

```nginx
# nginx.conf
gzip on;
gzip_types application/octet-stream audio/mpeg audio/aac;
gzip_level 6;
```

**Benefit**: ~40% bandwidth reduction for static assets

### 2. **Use Chunked Transfer Encoding**

Allows progressive streaming instead of full file pre-download:

```
Transfer-Encoding: chunked
```

### 3. **Set Cache Headers**

```nginx
location /radio/ {
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
}
```

### 4. **Enable HTTP/2 Server Push** (Advanced)

Push critical resources to client preemptively for faster loads.

## Browser Compatibility

| Browser | Network Info API | Buffering Support |
|---------|------------------|-------------------|
| Chrome | ✅ Yes | ✅ Full |
| Firefox | ✅ Yes | ✅ Full |
| Safari | ⚠️ Limited | ✅ Full |
| Edge | ✅ Yes | ✅ Full |
| Mobile Safari | ⚠️ Limited | ✅ Full |

**Note**: Safari has limited Network Information API support but full HTML5 audio buffering.

## Debugging & Testing

### Enable Debug Mode

Add `?debug=true` to URL to see detailed logging:

```
https://radio.rathore.club/?debug=true
```

### Console Monitoring

Watch for these log messages:

- `📡 Network change detected:` - Network type changed
- `📊 Buffer:` - Current buffer status
- `⚠️ Buffer dropping:` - Buffer below threshold
- `⚠️ Stream stalled for Xs` - Network stall detected
- `✓ Sufficient buffer acquired` - Ready to play

### Test on Slow Network

Using Chrome DevTools:

1. Open DevTools (F12)
2. Go to "Network" tab
3. Set throttling to "Slow 4G" or "3G"
4. Play a station and observe buffering behavior

### Simulate Network Changes

```javascript
// In console, manually test network change
navigator.connection.addEventListener('change', () => {
    console.log('Network changed to:', navigator.connection.effectiveType);
});
```

## Performance Impact

### Initial Load Size

- **HTML5 audio preload**: Minimal (browser-level, not additional)
- **Network monitoring**: <5KB JavaScript added
- **Buffer monitoring interval**: ~0.1ms per check

### Memory Usage

- **Buffer storage**: Browser manages (typically 500KB-2MB for streams)
- **Monitoring objects**: ~1KB overhead
- **No additional caching**: Uses browser's native buffer

## Known Limitations

1. **Live Streams Only**: Buffering optimizes for infinite-duration streams (live radio)
2. **Network Info API**: Not all browsers/versions support detailed info
3. **CORS Restrictions**: Some streams may require proxy for buffering
4. **Mobile Restrictions**: iOS has autoplay limitations

## Configuration

To adjust buffer parameters, modify `audio.js`:

```javascript
// Adjust buffer duration thresholds
this.minBufferDuration = 3; // Default: 3 seconds

// For very slow networks
if (this.isSlowConnection()) {
    this.minBufferDuration = 10; // Increase to 10 seconds
}

// Adjust monitoring interval
this.bufferMonitorTimeout = setInterval(() => {
    // Runs every 1000ms (1 second)
}, 1000);

// Adjust stall detection timeout
setTimeout(() => {
    // Currently 3000ms (3 seconds)
}, 3000);
```

## Future Improvements

1. **Adaptive Bitrate Selection** - Detect network speed and request lower bitrate streams
2. **Service Worker Streaming** - Cache first N seconds of streams for instant playback
3. **Network Fallback** - Automatically switch to backup streams if primary stalls
4. **Buffer Analytics** - Track stall frequency and duration for network insights
5. **User Preferences** - Let users configure buffer size and stall timeout

## Testing Scenarios

### Scenario 1: Flickering WiFi Connection

1. Set throttling to "Slow 4G"
2. Play a station
3. Toggle WiFi off/on repeatedly
4. **Expected**: Playback pauses during stalls, resumes when connection returns

### Scenario 2: Mobile Network Switch

1. Start playback on WiFi
2. Toggle to cellular (if available)
3. **Expected**: Buffer duration increases for 3G/2G, logging shows "Network change detected"

### Scenario 3: Sustained Slow Connection

1. Set throttling to "3G"
2. Play a station for 30+ seconds
3. **Expected**: Consistent playback with 3-4 second buffer ahead of playback

### Scenario 4: Connection Recovery

1. Set throttling to "Offline"
2. Start playback (should fail)
3. Restore connection
4. **Expected**: Auto-reconnect after 2 seconds

## Related Documents

- [Performance Optimization Guide](./PERFORMANCE.md) - Strategies for slow networks
- [Service Worker Caching](../service-worker.js) - Caching strategies
- [Audio Controller](../js/audio.js) - Implementation details
