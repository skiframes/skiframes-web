/**
 * Video player module with playback controls
 */

const Player = {
    video: null,
    modal: null,

    /**
     * Initialize player with video element
     */
    init(videoElement, modalElement) {
        this.video = videoElement;
        this.modal = modalElement;
        this.setupKeyboardControls();
    },

    // Store current URLs for download
    currentVideoUrl: null,
    currentComparisonUrl: null,

    /**
     * Open video in modal
     */
    open(videoUrl, title, meta, downloadUrl, comparisonUrl = null) {
        if (!this.video || !this.modal) return;

        // Store URLs for download
        this.currentVideoUrl = downloadUrl || videoUrl;
        this.currentComparisonUrl = comparisonUrl;

        // Set video source
        this.video.src = videoUrl;
        this.video.load();

        // Set info
        document.getElementById('videoTitle').textContent = title;
        document.getElementById('videoMeta').textContent = meta;

        // Handle comparison download button visibility
        const comparisonBtn = document.getElementById('downloadComparison');
        if (comparisonBtn) {
            comparisonBtn.style.display = comparisonUrl ? 'inline-flex' : 'none';
        }

        // Show modal
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Reset playback speed
        this.setSpeed(1);

        // Start playing
        this.video.play().catch(e => console.log('Autoplay prevented'));
    },

    /**
     * Close video modal
     */
    close() {
        if (!this.video || !this.modal) return;

        this.video.pause();
        this.video.src = '';
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
    },

    /**
     * Download current video using fetch+blob to force download
     */
    async downloadVideo() {
        if (this.currentVideoUrl) {
            const btn = document.getElementById('downloadVideo');
            await this.downloadWithFeedback(btn, this.currentVideoUrl);
        }
    },

    /**
     * Download comparison video using fetch+blob to force download
     */
    async downloadComparisonVideo() {
        if (this.currentComparisonUrl) {
            const btn = document.getElementById('downloadComparison');
            await this.downloadWithFeedback(btn, this.currentComparisonUrl);
        }
    },

    /**
     * Download with visual feedback on button
     */
    async downloadWithFeedback(btn, url) {
        if (!btn) return;
        const originalText = btn.textContent;
        btn.textContent = 'Downloading...';
        btn.classList.add('btn-downloading');
        btn.disabled = true;

        try {
            await Download.downloadSingle(url);
        } finally {
            btn.textContent = originalText;
            btn.classList.remove('btn-downloading');
            btn.disabled = false;
        }
    },

    /**
     * Copy video link to clipboard
     */
    async copyLink() {
        if (!this.currentVideoUrl) return;

        const btn = document.getElementById('copyLink');
        const originalText = btn?.textContent;

        try {
            await navigator.clipboard.writeText(this.currentVideoUrl);
            if (btn) {
                btn.textContent = 'Copied!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to copy link:', err);
            if (btn) {
                btn.textContent = 'Failed';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            }
        }
    },

    /**
     * Set playback speed
     */
    setSpeed(speed) {
        if (!this.video) return;
        this.video.playbackRate = speed;

        // Update UI buttons
        const speeds = { 0.25: 'speed025', 0.5: 'speedDown', 1: 'speedNormal' };
        Object.entries(speeds).forEach(([s, id]) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.toggle('btn-active', parseFloat(s) === speed);
            }
        });
    },

    /**
     * Step frame backward
     */
    frameBack() {
        if (!this.video) return;
        this.video.pause();
        // Assume 30fps, step back ~1 frame
        this.video.currentTime = Math.max(0, this.video.currentTime - (1/30));
    },

    /**
     * Step frame forward
     */
    frameForward() {
        if (!this.video) return;
        this.video.pause();
        // Assume 30fps, step forward ~1 frame
        this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + (1/30));
    },

    /**
     * Toggle play/pause
     */
    togglePlay() {
        if (!this.video) return;
        if (this.video.paused) {
            this.video.play();
        } else {
            this.video.pause();
        }
    },

    /**
     * Seek by seconds (positive or negative)
     */
    seek(seconds) {
        if (!this.video) return;
        this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
    },

    /**
     * Setup keyboard controls
     */
    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            // Only handle if modal is open
            if (this.modal && this.modal.style.display === 'none') return;

            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.frameBack();
                    } else {
                        this.seek(-5);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.frameForward();
                    } else {
                        this.seek(5);
                    }
                    break;
                case ',':
                    e.preventDefault();
                    this.frameBack();
                    break;
                case '.':
                    e.preventDefault();
                    this.frameForward();
                    break;
                case 'Escape':
                    this.close();
                    break;
                case 'f':
                    e.preventDefault();
                    if (this.video.requestFullscreen) {
                        this.video.requestFullscreen();
                    }
                    break;
            }
        });
    },

    /**
     * Format duration in seconds to MM:SS
     */
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
};

// Fullscreen Montage Viewer
const ImageViewer = {
    modal: null,
    currentImg: null,
    fastestImg: null,

    // State
    montages: [],
    currentIndex: 0,
    fastestMontage: null,
    eventId: null,
    compareMode: false,

    init(imageElement, modalElement) {
        this.currentImg = imageElement;
        this.modal = modalElement;
        this.fastestImg = document.getElementById('montageFastestImg');
        this.setupControls();
        this.setupKeyboard();
    },

    open(index, montages, fastestMontage, eventId) {
        if (!this.modal) return;

        this.montages = montages;
        this.currentIndex = index;
        this.fastestMontage = fastestMontage;
        this.eventId = eventId;
        this.compareMode = false;

        // Reset compare UI
        const compareBtn = document.getElementById('compareToggle');
        if (compareBtn) {
            compareBtn.classList.remove('active');
            compareBtn.textContent = 'Compare with Fastest';
        }
        const fastestPanel = document.getElementById('montageFastestPanel');
        if (fastestPanel) fastestPanel.style.display = 'none';
        const display = document.getElementById('montageDisplay');
        if (display) display.classList.remove('split-view');

        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.loadMontage(index);
    },

    close() {
        if (!this.modal) return;
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        if (this.currentImg) this.currentImg.src = '';
        if (this.fastestImg) this.fastestImg.src = '';
    },

    loadMontage(index) {
        const montage = this.montages[index];
        if (!montage) return;
        this.currentIndex = index;

        // Title
        const title = `Run ${montage.run_number || '?'}` +
            (montage.elapsed_time != null ? ` \u2022 ${montage.elapsed_time.toFixed(2)}s` : '');
        const titleEl = document.getElementById('imageTitle');
        if (titleEl) titleEl.textContent = title;

        // Counter
        const counterEl = document.getElementById('montageCounter');
        if (counterEl) counterEl.textContent = `${index + 1} / ${this.montages.length}`;

        // Download
        const fullUrl = API.getMediaUrl(montage.full_url, this.eventId);
        const downloadEl = document.getElementById('downloadImage');
        if (downloadEl) downloadEl.href = fullUrl;

        // Progressive load
        const thumbUrl = API.getMediaUrl(montage.thumb_url, this.eventId);
        if (this.currentImg) {
            this.currentImg.src = thumbUrl;
            const full = new Image();
            full.onload = () => {
                if (this.currentIndex === index) this.currentImg.src = fullUrl;
            };
            full.src = fullUrl;
        }

        // Current info overlay
        const currentInfo = document.getElementById('montageCurrentInfo');
        if (currentInfo) {
            currentInfo.textContent = montage.elapsed_time != null
                ? `${montage.elapsed_time.toFixed(2)}s` : '';
        }

        // Nav buttons
        const prevBtn = document.getElementById('montagePrev');
        const nextBtn = document.getElementById('montageNext');
        if (prevBtn) prevBtn.disabled = (index <= 0);
        if (nextBtn) nextBtn.disabled = (index >= this.montages.length - 1);

        // Compare button: always visible if fastest exists (even when viewing fastest itself)
        const compareBtn = document.getElementById('compareToggle');
        if (compareBtn) {
            compareBtn.style.display = this.fastestMontage ? 'inline-flex' : 'none';
        }

        if (this.compareMode) this.loadFastestPanel();
    },

    loadFastestPanel() {
        if (!this.fastestMontage || !this.fastestImg) return;
        const f = this.fastestMontage;
        const thumbUrl = API.getMediaUrl(f.thumb_url, this.eventId);
        const fullUrl = API.getMediaUrl(f.full_url, this.eventId);

        this.fastestImg.src = thumbUrl;
        const full = new Image();
        full.onload = () => {
            if (this.compareMode) this.fastestImg.src = fullUrl;
        };
        full.src = fullUrl;

        const info = document.getElementById('montageFastestInfo');
        if (info) {
            info.textContent = f.elapsed_time != null
                ? `${f.elapsed_time.toFixed(2)}s (Fastest)` : 'Fastest';
        }
    },

    navigate(delta) {
        const idx = this.currentIndex + delta;
        if (idx < 0 || idx >= this.montages.length) return;
        this.loadMontage(idx);
    },

    toggleComparison() {
        this.compareMode = !this.compareMode;
        const display = document.getElementById('montageDisplay');
        const panel = document.getElementById('montageFastestPanel');
        const btn = document.getElementById('compareToggle');

        if (display) display.classList.toggle('split-view', this.compareMode);
        if (panel) panel.style.display = this.compareMode ? 'flex' : 'none';
        if (btn) {
            btn.classList.toggle('active', this.compareMode);
            btn.textContent = this.compareMode ? 'Hide Fastest' : 'Compare with Fastest';
        }
        if (this.compareMode) this.loadFastestPanel();
    },

    setupControls() {
        if (!this.modal) return;
        const close = this.modal.querySelector('.montage-viewer-close');
        if (close) close.addEventListener('click', () => this.close());

        const prev = document.getElementById('montagePrev');
        const next = document.getElementById('montageNext');
        if (prev) prev.addEventListener('click', () => this.navigate(-1));
        if (next) next.addEventListener('click', () => this.navigate(1));

        const compare = document.getElementById('compareToggle');
        if (compare) compare.addEventListener('click', () => this.toggleComparison());

        // Click on dark area outside images to close
        const body = this.modal.querySelector('.montage-viewer-body');
        if (body) {
            body.addEventListener('click', (e) => {
                if (e.target === body || e.target.classList.contains('montage-display')) {
                    this.close();
                }
            });
        }
    },

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (!this.modal || this.modal.style.display === 'none') return;
            switch (e.key) {
                case 'Escape': this.close(); break;
                case 'ArrowLeft': e.preventDefault(); this.navigate(-1); break;
                case 'ArrowRight': e.preventDefault(); this.navigate(1); break;
                case 'c': case 'C':
                    if (this.fastestMontage) {
                        e.preventDefault();
                        this.toggleComparison();
                    }
                    break;
            }
        });
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Player, ImageViewer };
}
