/**
 * Virtual Race — Side-by-side athlete comparison
 * Modes: PM (Photo Montage), V (Video), AI (AI Analysis)
 */

const VirtualRace = {
    modal: null,
    manifest: null,
    mode: 'V',            // 'PM', 'V', 'AI'
    athletes: [],         // Non-comparison videos sorted by bib
    montages: [],         // Available montages
    athleteA: null,       // Selected video object for A
    athleteB: null,       // Selected video object for B
    videoA: null,         // <video> DOM element
    videoB: null,         // <video> DOM element
    isPlaying: false,
    playbackRate: 1,
    syncRAF: null,        // requestAnimationFrame ID

    /**
     * Open Virtual Race modal
     */
    open(manifest) {
        this.manifest = manifest;
        this.modal = document.getElementById('virtualRaceModal');
        if (!this.modal) return;

        // Gather athletes from videos (non-comparison, unique by bib)
        const videos = (manifest.content.videos || []).filter(v => !v.is_comparison);
        const seen = new Set();
        this.athletes = [];
        videos.forEach(v => {
            if (!seen.has(v.bib)) {
                seen.add(v.bib);
                this.athletes.push(v);
            }
        });
        this.athletes.sort((a, b) => a.bib - b.bib);

        // Gather montages
        this.montages = manifest.content.montages || [];

        // Determine available modes
        const hasVideos = this.athletes.length >= 2;
        const hasMontages = this.montages.length >= 2;
        // AI: check if any video has an AI/pose analysis URL (future)
        const hasAI = false;

        // Update mode tab states
        this._setTabEnabled('V', hasVideos);
        this._setTabEnabled('PM', hasMontages);
        this._setTabEnabled('AI', hasAI);

        // Pick default mode
        if (hasVideos) this.mode = 'V';
        else if (hasMontages) this.mode = 'PM';
        else this.mode = 'V';

        this._setActiveTab(this.mode);

        // Populate dropdowns
        this._populateDropdowns();

        // Default selections: rank #1 and #2 by duration
        const ranked = [...this.athletes].filter(a => a.duration).sort((a, b) => a.duration - b.duration);
        if (ranked.length >= 2) {
            this.athleteA = ranked[0];
            this.athleteB = ranked[1];
        } else if (this.athletes.length >= 2) {
            this.athleteA = this.athletes[0];
            this.athleteB = this.athletes[1];
        }

        // Set dropdown values
        const selA = document.getElementById('vrSelectA');
        const selB = document.getElementById('vrSelectB');
        if (selA && this.athleteA) selA.value = this.athleteA.bib;
        if (selB && this.athleteB) selB.value = this.athleteB.bib;

        // Show modal
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Render content
        this.renderContent();

        // Setup keyboard
        this._keyHandler = (e) => this._onKeydown(e);
        document.addEventListener('keydown', this._keyHandler);
    },

    /**
     * Close modal
     */
    close() {
        if (!this.modal) return;
        this._stopSync();
        this._pauseVideos();

        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        this.videoA = null;
        this.videoB = null;
        this.isPlaying = false;

        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    },

    /**
     * Switch mode (PM / V / AI)
     */
    setMode(mode) {
        const tab = this.modal.querySelector(`.vr-mode-tab[data-mode="${mode}"]`);
        if (tab && tab.disabled) return;

        this._pauseVideos();
        this._stopSync();
        this.mode = mode;
        this._setActiveTab(mode);
        this.isPlaying = false;
        this.renderContent();
    },

    /**
     * Athlete selected from dropdown
     */
    selectAthlete(side, bib) {
        const bibNum = parseInt(bib);
        const athlete = this.athletes.find(a => a.bib === bibNum);
        if (!athlete) return;

        if (side === 'A') this.athleteA = athlete;
        else this.athleteB = athlete;

        this._pauseVideos();
        this._stopSync();
        this.isPlaying = false;
        this.renderContent();
    },

    /**
     * Render content based on current mode and selected athletes
     */
    renderContent() {
        const container = document.getElementById('vrContent');
        if (!container) return;

        if (this.mode === 'V') {
            this._renderVideoMode(container);
        } else if (this.mode === 'PM') {
            this._renderPMMode(container);
        } else if (this.mode === 'AI') {
            this._renderAIMode(container);
        }

        this._updateControls();
        this._updateDiff();
    },

    // ========================================
    // Video Mode
    // ========================================

    _renderVideoMode(container) {
        if (!this.athleteA || !this.athleteB) {
            container.innerHTML = '<div class="vr-empty">Select two athletes to compare</div>';
            return;
        }

        const eventId = this.manifest.event_id;
        const urlA = API.getMediaUrl(this.athleteA.video_url, eventId);
        const urlB = API.getMediaUrl(this.athleteB.video_url, eventId);

        container.innerHTML = `
            <div class="vr-panels">
                <div class="vr-panel">
                    <div class="vr-panel-label">#${this.athleteA.bib} ${this.athleteA.athlete}</div>
                    <div class="vr-video-wrap">
                        <video id="vrVideoA" preload="auto" playsinline muted>
                            <source src="${urlA}" type="video/mp4">
                        </video>
                    </div>
                    <div class="vr-panel-info">
                        ${this.athleteA.duration ? this.athleteA.duration.toFixed(2) + 's' : '-'}
                        <span class="vr-panel-meta">${this.athleteA.team || ''} ${this.athleteA.gender || ''}</span>
                    </div>
                </div>
                <div class="vr-panel">
                    <div class="vr-panel-label">#${this.athleteB.bib} ${this.athleteB.athlete}</div>
                    <div class="vr-video-wrap">
                        <video id="vrVideoB" preload="auto" playsinline muted>
                            <source src="${urlB}" type="video/mp4">
                        </video>
                    </div>
                    <div class="vr-panel-info">
                        ${this.athleteB.duration ? this.athleteB.duration.toFixed(2) + 's' : '-'}
                        <span class="vr-panel-meta">${this.athleteB.team || ''} ${this.athleteB.gender || ''}</span>
                    </div>
                </div>
            </div>
        `;

        this.videoA = document.getElementById('vrVideoA');
        this.videoB = document.getElementById('vrVideoB');

        // Set playback rate
        if (this.videoA) this.videoA.playbackRate = this.playbackRate;
        if (this.videoB) this.videoB.playbackRate = this.playbackRate;

        // Show video controls section
        const ctrlSection = document.getElementById('vrControlsSection');
        if (ctrlSection) ctrlSection.style.display = 'flex';
    },

    // ========================================
    // Photo Montage Mode
    // ========================================

    _renderPMMode(container) {
        if (this.montages.length < 2) {
            container.innerHTML = '<div class="vr-empty">No photo montages available for this event</div>';
            const ctrlSection = document.getElementById('vrControlsSection');
            if (ctrlSection) ctrlSection.style.display = 'none';
            return;
        }

        // For montage mode, use the same athlete selectors but look up montages
        // Montages may not have bib info — show what's available
        const eventId = this.manifest.event_id;

        // Use first two montages as default if no athlete match
        const m1 = this.montages[0];
        const m2 = this.montages.length > 1 ? this.montages[1] : null;

        if (!m2) {
            container.innerHTML = '<div class="vr-empty">Need at least 2 montages to compare</div>';
            return;
        }

        const imgA = API.getMediaUrl(m1.full_url || m1.thumb_url, eventId);
        const imgB = API.getMediaUrl(m2.full_url || m2.thumb_url, eventId);

        container.innerHTML = `
            <div class="vr-panels">
                <div class="vr-panel">
                    <div class="vr-panel-label">Run ${m1.run_number || '?'}</div>
                    <div class="vr-montage-wrap">
                        <img src="${imgA}" alt="Montage A">
                    </div>
                    <div class="vr-panel-info">
                        ${m1.elapsed_time ? m1.elapsed_time.toFixed(2) + 's' : '-'}
                    </div>
                </div>
                <div class="vr-panel">
                    <div class="vr-panel-label">Run ${m2.run_number || '?'}</div>
                    <div class="vr-montage-wrap">
                        <img src="${imgB}" alt="Montage B">
                    </div>
                    <div class="vr-panel-info">
                        ${m2.elapsed_time ? m2.elapsed_time.toFixed(2) + 's' : '-'}
                    </div>
                </div>
            </div>
        `;

        // Hide video controls for PM mode
        const ctrlSection = document.getElementById('vrControlsSection');
        if (ctrlSection) ctrlSection.style.display = 'none';
    },

    // ========================================
    // AI Mode
    // ========================================

    _renderAIMode(container) {
        container.innerHTML = '<div class="vr-empty">AI analysis not available for this event</div>';
        const ctrlSection = document.getElementById('vrControlsSection');
        if (ctrlSection) ctrlSection.style.display = 'none';
    },

    // ========================================
    // Video Playback Controls
    // ========================================

    togglePlay() {
        if (this.isPlaying) {
            this._pauseVideos();
        } else {
            this._playVideos();
        }
    },

    _playVideos() {
        if (!this.videoA || !this.videoB) return;

        const playA = this.videoA.play();
        const playB = this.videoB.play();
        Promise.all([playA, playB].filter(p => p)).then(() => {
            this.isPlaying = true;
            this._updatePlayBtn();
            this._startSync();
        }).catch(e => console.log('Autoplay prevented:', e));
    },

    _pauseVideos() {
        if (this.videoA && !this.videoA.paused) this.videoA.pause();
        if (this.videoB && !this.videoB.paused) this.videoB.pause();
        this.isPlaying = false;
        this._updatePlayBtn();
        this._stopSync();
    },

    _startSync() {
        this._stopSync();
        const sync = () => {
            if (!this.isPlaying || !this.videoA || !this.videoB) return;

            // Keep videos in sync — use A as master
            const drift = Math.abs(this.videoA.currentTime - this.videoB.currentTime);
            if (drift > 0.1) {
                this.videoB.currentTime = this.videoA.currentTime;
            }

            // Update time display
            this._updateTimeDisplay();

            this.syncRAF = requestAnimationFrame(sync);
        };
        this.syncRAF = requestAnimationFrame(sync);
    },

    _stopSync() {
        if (this.syncRAF) {
            cancelAnimationFrame(this.syncRAF);
            this.syncRAF = null;
        }
    },

    setSpeed(rate) {
        this.playbackRate = rate;
        if (this.videoA) this.videoA.playbackRate = rate;
        if (this.videoB) this.videoB.playbackRate = rate;

        // Update speed button active states
        this.modal.querySelectorAll('.vr-speed-btn').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.speed) === rate);
        });
    },

    frameStep(delta) {
        this._pauseVideos();
        const step = delta / 30; // Assume 30fps
        if (this.videoA) this.videoA.currentTime = Math.max(0, this.videoA.currentTime + step);
        if (this.videoB) this.videoB.currentTime = Math.max(0, this.videoB.currentTime + step);
        this._updateTimeDisplay();
    },

    restart() {
        if (this.videoA) this.videoA.currentTime = 0;
        if (this.videoB) this.videoB.currentTime = 0;
        this._updateTimeDisplay();
    },

    // ========================================
    // UI Helpers
    // ========================================

    _populateDropdowns() {
        const selA = document.getElementById('vrSelectA');
        const selB = document.getElementById('vrSelectB');
        if (!selA || !selB) return;

        const options = this.athletes.map(a => {
            const time = a.duration ? ` (${a.duration.toFixed(2)}s)` : '';
            return `<option value="${a.bib}">#${a.bib} ${a.athlete}${time}</option>`;
        }).join('');

        selA.innerHTML = options;
        selB.innerHTML = options;
    },

    _setTabEnabled(mode, enabled) {
        const tab = this.modal?.querySelector(`.vr-mode-tab[data-mode="${mode}"]`);
        if (tab) {
            tab.disabled = !enabled;
            tab.classList.toggle('disabled', !enabled);
        }
    },

    _setActiveTab(mode) {
        this.modal?.querySelectorAll('.vr-mode-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });
    },

    _updatePlayBtn() {
        const btn = document.getElementById('vrPlayBtn');
        if (btn) btn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';
    },

    _updateControls() {
        // Show/hide controls based on mode
        const playBtn = document.getElementById('vrPlayBtn');
        if (playBtn) {
            playBtn.textContent = '▶ Play';
        }
    },

    _updateTimeDisplay() {
        const display = document.getElementById('vrTimeDisplay');
        if (!display || !this.videoA) return;

        const t = this.videoA.currentTime;
        display.textContent = `${t.toFixed(2)}s`;
    },

    _updateDiff() {
        const diffEl = document.getElementById('vrDiff');
        if (!diffEl) return;

        if (this.athleteA?.duration && this.athleteB?.duration) {
            const diff = this.athleteB.duration - this.athleteA.duration;
            const sign = diff > 0 ? '+' : '';
            diffEl.textContent = `${sign}${diff.toFixed(2)}s`;
            diffEl.className = 'vr-diff ' + (diff > 0 ? 'vr-diff-behind' : diff < 0 ? 'vr-diff-ahead' : '');
        } else {
            diffEl.textContent = '';
            diffEl.className = 'vr-diff';
        }
    },

    _onKeydown(e) {
        if (!this.modal || this.modal.style.display === 'none') return;

        switch (e.key) {
            case 'Escape':
                this.close();
                break;
            case ' ':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.frameStep(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.frameStep(1);
                break;
            case 'r':
            case 'R':
                e.preventDefault();
                this.restart();
                break;
        }
    }
};
