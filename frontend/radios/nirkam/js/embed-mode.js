/**
 * SyncRadio Embed Mode
 * Detects if the player is being embedded in another application
 * and adjusts the UI accordingly
 */

(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const embedMode = urlParams.get('embed') === 'true';
  const minimalMode = urlParams.get('minimal') === 'true';

  if (embedMode) {
    // Hide header and footer in embed mode
    document.addEventListener('DOMContentLoaded', function() {
      const header = document.getElementById('headerElement');
      const footer = document.querySelector('.footer-info');
      const container = document.getElementById('mainContainer');

      if (header) header.style.display = 'none';
      if (footer) footer.style.display = 'none';

      // Make container take full height
      if (container) {
        container.style.minHeight = '100vh';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.justifyContent = 'center';
      }

      // Expose API for parent window
      window.syncRadioAPI = {
        play: () => {
          if (window.syncRadio && window.syncRadio.play) {
            window.syncRadio.play();
          }
        },
        pause: () => {
          if (window.syncRadio && window.syncRadio.pause) {
            window.syncRadio.pause();
          }
        },
        getNowPlaying: () => {
          if (window.syncRadio && window.syncRadio.currentSong) {
            return window.syncRadio.currentSong;
          }
          return null;
        },
        getStatus: () => {
          if (window.syncRadio) {
            return {
              isPlaying: window.syncRadio.isPlaying,
              currentTime: window.syncRadio.audioPlayer?.currentTime || 0,
              hasStarted: window.syncRadio.hasStarted,
              station: {
                name: 'SyncRadio',
                description: 'Synchronized internet radio'
              }
            };
          }
          return null;
        },
        addListener: (event, callback) => {
          if (window.syncRadio && window.syncRadio.on) {
            window.syncRadio.on(event, callback);
          }
        }
      };

      // Notify parent that embed is ready
      window.parent.postMessage({
        type: 'syncradio-ready',
        api: 'syncRadioAPI'
      }, '*');
    });
  }

  if (minimalMode) {
    // Minimal UI mode
    document.addEventListener('DOMContentLoaded', function() {
      const statusPanel = document.querySelector('.status-panel');
      const upcomingPanel = document.querySelector('.upcoming-panel');
      const header = document.getElementById('headerElement');

      if (statusPanel) statusPanel.style.display = 'none';
      if (upcomingPanel) upcomingPanel.style.display = 'none';
      if (header) header.style.display = 'none';
    });
  }

  // Expose station info
  window.syncRadioStationInfo = {
    id: '667add4e-3e14-49bf-a314-8415b893c0bc',
    name: 'Nirkam',
    location: 'Chapra, Bihar, India',
    description: 'Nirkam - Synchronized internet radio from Chapra, India. All listeners worldwide hear the same song at the same position',
    url: 'https://nirkam.rathore.club/',
    embed_url: 'https://nirkam.rathore.club/embed.html',
    type: 'web-player',
    sync_type: 'UTC-based',
    all_listeners_synchronized: true,
    metadata_url: 'https://nirkam.rathore.club/api/now-playing.json',
    info_url: 'https://nirkam.rathore.club/station-info.json'
  };

  // Add CORS headers info (for aggregator integration)
  fetch('/station-info.json')
    .then(r => r.json())
    .then(data => {
      window.syncRadioInfo = data;
    })
    .catch(err => console.log('Station info not available'));
})();
