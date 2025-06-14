{
  class AudioPlayer extends HTMLElement {
    maxVolume = 1;
    playing = false;
    volume = 0.5;
    prevVolume = 0.4;
    initialized = false;
    barWidth = 3;
    barGap = 1;
    bufferPercentage = 75;
    nonAudioAttributes = new Set(['title', 'bar-width', 'bar-gap', 'buffer-percentage']);

    constructor() {
      super();

      this.attachShadow({mode: 'open'});
      this.render();
    }

    static get observedAttributes() {
      return [
        'src', 'muted', 'crossorigin', 'loop', 'preload', 'autoplay',
        'title', 'bar-width', 'bar-gap', 'buffer-percentage'
      ];
    }

    async attributeChangedCallback(name, oldValue, newValue) {
      switch (name) {
        case 'src':
          this.initialized = false;
          this.render();
          this.initializeAudio();
          break;
        case 'muted':
          this.toggleMute(Boolean(this.audio?.getAttribute('muted')));
          break;
        case 'title':
          this.titleElement.textContent = newValue;
          break;
        case 'bar-width':
          this.barWidth = Number(newValue) || 3;
          break;
        case 'bar-gap':
          this.barGap = Number(newValue) || 1;
          break;
        case 'buffer-percentage':
          this.bufferPercentage = Number(newValue) || 75;
          break;
        default:
      }

      this.updateAudioAttributes(name, newValue);
    }

    updateAudioAttributes(name, value) {
      if (!this.audio || this.nonAudioAttributes.has(name)) return;

      if (this.attributes.getNamedItem(name)) {
        this.audio.setAttribute(name, value ?? '')
      } else {
        this.audio.removeAttribute(name);
      }
    }

    initializeAudio() {
      if (this.initialized) return;

      this.initialized = true;

      this.audioCtx = new AudioContext();
      this.gainNode = this.audioCtx.createGain();
      this.analyserNode = this.audioCtx.createAnalyser();
      this.track = this.audioCtx.createMediaElementSource(this.audio);

      this.analyserNode.fftSize = 2048;
      this.bufferLength = this.analyserNode.frequencyBinCount;
      this.dataArray = new Uint8Array(this.bufferLength);
      this.analyserNode.getByteFrequencyData(this.dataArray);

      this.track
        .connect(this.gainNode)
        .connect(this.analyserNode)
        .connect(this.audioCtx.destination);

      this.changeVolume();
    }

    updateFrequency() {
      if (!this.playing) return;

      this.analyserNode.getByteFrequencyData(this.dataArray);

      this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      this.canvasCtx.fillStyle = "rgba(0, 0, 0, 0)";
      this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      const barCount = (this.canvas.width / (this.barWidth + this.barGap)) - this.barGap;
      const bufferSize = (this.bufferLength * this.bufferPercentage) / 100;
      let x = 0;

      for (let i = 0; i < barCount; i++) {
        const iPerc = Math.round((i * 100) / barCount);
        const pos = Math.round((bufferSize * iPerc) / 100);
        const frequency = this.dataArray[pos];
        const frequencyPerc = (frequency * 100) / 255;
        const barHeight = (frequencyPerc * this.canvas.height) / 100;
        const y = this.canvas.height - barHeight;

        this.canvasCtx.fillStyle = `rgba(${frequency}, 255, 100)`;
        this.canvasCtx.fillRect(x, y, this.barWidth, barHeight);

        x += (this.barWidth + this.barGap);
      }

      requestAnimationFrame(this.updateFrequency.bind(this))
    }

    attachEvents() {
      this.volumeBar.parentNode.addEventListener('click', e => {
        if (e.target === this.volumeBar.parentNode) {
          this.toggleMute();
        }
      }, false);

      this.playPauseBtn.addEventListener('click', this.togglePlay.bind(this), false);

      this.volumeBar.addEventListener('input', this.changeVolume.bind(this), false);

      this.progressBar.addEventListener('input', (e) => this.seekTo(this.progressBar.value), false);

      this.audio.addEventListener('loadedmetadata', () => {
        this.progressBar.max = this.audio.duration;
        this.durationEl.textContent = this.getTimeString(this.audio.duration);
        this.updateAudioTime();
      })

      this.audio.addEventListener('error', (e) => {
        this.titleElement.textContent = this.audio.error.message;
        this.playPauseBtn.disabled = true;
      })

      this.audio.addEventListener('timeupdate', () => {
        this.updateAudioTime(this.audio.currentTime);
      })

      this.audio.addEventListener('ended', () => {
        this.playing = false;
        this.playPauseBtn.textContent = 'play';
        this.playPauseBtn.classList.remove('playing');
      }, false);

      this.audio.addEventListener('pause', () => {
        this.playing = false;
        this.playPauseBtn.textContent = 'play';
        this.playPauseBtn.classList.remove('playing');
      }, false);

      this.audio.addEventListener('play', () => {
        this.playing = true;
        this.playPauseBtn.textContent = 'pause';
        this.playPauseBtn.classList.add('playing');
        this.updateFrequency();

        document.querySelectorAll('audio-player').forEach(player => {
          if (player !== this) {
            player.audio.pause();
          }
        });
      }, false);

      this.volumeUpBtn.addEventListener('click', () => {
        this.volumeBar.value = Math.min(Number(this.volumeBar.value) + 0.1, this.maxVolume);
        this.changeVolume();
      });

      this.volumeDownBtn.addEventListener('click', () => {
        this.volumeBar.value = Math.max(Number(this.volumeBar.value) - 0.1, 0);
        this.changeVolume();
      });
    }

    async togglePlay() {
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      if (this.playing) {
        return this.audio.pause();
      }

      return this.audio.play();
    }

    getTimeString(time) {
      const secs = `${parseInt(`${time % 60}`, 10)}`.padStart(2, '0');
      const min = parseInt(`${(time / 60) % 60}`, 10);

      return `${min}:${secs}`;
    }

    changeVolume() {
      this.volume = Math.min(this.volumeBar.value, 1);

      if (Number(this.volume) > 1) {
        this.volumeBar.parentNode.className = 'volume-bar over';
      } else if (Number(this.volume) > 0) {
        this.volumeBar.parentNode.className = 'volume-bar half';
      } else {
        this.volumeBar.parentNode.className = 'volume-bar';
      }

      if (this.gainNode) {
        this.gainNode.gain.value = this.volume;
      }
    }

    toggleMute(muted = null) {
      this.volumeBar.value = muted || this.volume === 0 ? this.prevVolume : 0;
      this.changeVolume();
    }

    seekTo(value) {
      this.audio.currentTime = value;
    }

    updateAudioTime() {
      this.progressBar.value = this.audio.currentTime;
      this.currentTimeEl.textContent = this.getTimeString(this.audio.currentTime);
    }

    style() {
      return `
      <style>
        :host {
          width: 100%;
          max-width: 400px;
          font-family: sans-serif;
        }
        
        * {
            box-sizing: border-box;
        }
        
        .audio-player {
          background: #111;
          border-radius: 5px;
          padding: 5px;
          color: #fff;
          display: flex;
          align-items: center;
          position: relative;
          margin: 0 0 25px;
        }
        
        .audio-name {
             position: absolute;
            color: #fff;
            padding: 5px 10px;
            font-size: 12px;
            width: 100%;
            left: 0;
            z-index: 2;
            text-transform: capitalize;
            text-overflow: ellipsis;
            overflow: hidden;
            white-space: nowrap;
            font-weight: 400;
            top: calc(100% + 2px);
            background: #111;
            margin: 0;
            border-radius: 3px;
        }
        
        .play-btn {
            width: 30px;
            min-width: 30px;
            height: 30px;
            background: url("./audio-player-icon-sprite.png") 0 center/500% 100% no-repeat;
            appearance: none;
            border: none;
            text-indent: -999999px;
            overflow: hidden;
        }
        
        .play-btn.playing {
            background: url("./audio-player-icon-sprite.png") 25% center/500% 100% no-repeat;
        }
        
        .volume-bar {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            max-width: 150px; /* Уменьшена ширина полосы громкости */
            margin: 0 auto;
        }
        
        .volume-field {
            appearance: none;
            height: 20px;
            width: 60px;
            margin: 0 5px;
            background: #333; /* Темно-серый фон */
        }
        
        .volume-field::-webkit-slider-thumb {
            appearance: none;
            height: 20px;
            width: 10px;
            background: #ccc; /* Светло-серый ползунок */
        }
        
        .volume-field::-moz-range-thumb {
            appearance: none;
            height: 20px;
            width: 10px;
            background: #ccc; /* Светло-серый ползунок */
        }
        
        .volume-field::-ms-thumb {
            appearance: none;
            height: 20px;
            width: 10px;
            background: #ccc; /* Светло-серый ползунок */
        }
        
        .volume-up-btn, .volume-down-btn {
            width: 20px;
            height: 20px;
            background: #555; /* Темно-серый фон кнопок */
            color: #fff; /* Белый текст */
            border: none;
            border-radius: 30%;
            cursor: pointer;
            transition: background 0.3s;
        }

        .volume-up-btn:hover, .volume-down-btn:hover {
            background: #777; /* Светлее при наведении */
        }
        
        .progress-indicator {
            display: flex;
            justify-content: flex-end;
            position: relative;
            flex: 1;
            font-size: 12px;
            align-items: center;
            height: 20px;
        }
        
        .progress-bar {
            flex: 1;
            position: absolute;
            top: 50%;
            left: 0;
            z-index: 2;
            transform: translateY(-50%);
            width: 100%;
            appearance: none;
            margin: 0;
            overflow: hidden;
            background: none;
        }
        
        .progress-bar::-webkit-slider-thumb {
            appearance: none;
            height: 20px;
            width: 0;
            box-shadow: -300px 0 0 300px #ffffff38;
        }
        
        .progress-bar::-moz-range-thumb {
            appearance: none;
            height: 20px;
            width: 0;
            box-shadow: -300px 0 0 300px #ffffff21;
        }
        
        .progress-bar::-ms-thumb {
            appearance: none;
            height: 20px;
            width: 0;
            box-shadow: -300px 0 0 300px #ffffff21;
        }
        
        .duration,
        .current-time {
            position: relative;
            z-index: 1;
            text-shadow: 0 0 2px #111;
        }
        
        .duration {
            margin-left: 2px;
            margin-right: 5px;
        }
        
        .duration::before {
            content: '/';
            display: inline-block;
            margin-right: 2px;
        }
        
        canvas {
            position: absolute;
            top: 50%;
            left: 0;
            transform: translateY(-50%);
            opacity: 0.4;
        }
      </style>
    `
    }

    render() {
      this.shadowRoot.innerHTML = `
       ${this.style()}
        <figure class="audio-player">
          <figcaption class="audio-name"></figcaption>
          <audio style="display: none"></audio>
          <button class="play-btn" type="button">play</button>
          <div class="progress-indicator">
              <span class="current-time">0:0</span>
              <input type="range" max="100" value="0" class="progress-bar">
              <span class="duration">0:00</span>
              <canvas class="visualizer" style="width: 100%; height: 20px"></canvas>
          </div>
          <div class="volume-bar">
              <button class="volume-down-btn" type="button">-</button>
              <input type="range" min="0" max="1" step="0.01" value="${this.volume}" class="volume-field">
              <button class="volume-up-btn" type="button">+</button>
          </div>
        </figure>
      `;

      this.audio = this.shadowRoot.querySelector('audio');
      this.playPauseBtn = this.shadowRoot.querySelector('.play-btn');
      this.titleElement = this.shadowRoot.querySelector('.audio-name');
      this.volumeBar = this.shadowRoot.querySelector('.volume-field');
      this.volumeUpBtn = this.shadowRoot.querySelector('.volume-up-btn');
      this.volumeDownBtn = this.shadowRoot.querySelector('.volume-down-btn');
      this.progressIndicator = this.shadowRoot.querySelector('.progress-indicator');
      this.currentTimeEl = this.progressIndicator.children[0];
      this.progressBar = this.progressIndicator.children[1];
      this.durationEl = this.progressIndicator.children[2];
      this.canvas = this.shadowRoot.querySelector('canvas');

      this.canvasCtx = this.canvas.getContext("2d");
      const scale = window.devicePixelRatio;
      this.canvas.width = Math.floor(this.canvas.width * scale);
      this.canvas.height = Math.floor(this.canvas.height * scale);
      this.titleElement.textContent = this.attributes.getNamedItem('src')
        ? this.attributes.getNamedItem('title').value ?? 'untitled'
        : 'No Audio Source Provided';
      this.volumeBar.value = this.volume;

      for (let i = 0; i < this.attributes.length; i++) {
        const attr = this.attributes[i];
        this.updateAudioAttributes(attr.name, attr.value);
      }

      this.attachEvents();
    }
  }

  customElements.define('audio-player', AudioPlayer);
}