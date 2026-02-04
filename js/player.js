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

    /**
     * Open video in modal
     */
    open(videoUrl, title, meta, downloadUrl, comparisonUrl = null) {
        if (!this.video || !this.modal) return;

        // Set video source
        this.video.src = videoUrl;
        this.video.load();

        // Set info
        document.getElementById('videoTitle').textContent = title;
        document.getElementById('videoMeta').textContent = meta;
        document.getElementById('downloadVideo').href = downloadUrl || videoUrl;

        // Handle comparison download button
        const comparisonBtn = document.getElementById('downloadComparison');
        if (comparisonBtn) {
            if (comparisonUrl) {
                comparisonBtn.href = comparisonUrl;
                comparisonBtn.style.display = 'inline-flex';
            } else {
                comparisonBtn.style.display = 'none';
            }
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
     * Set playback speed
     */
    setSpeed(speed) {
        if (!this.video) return;
        this.video.playbackRate = speed;

        // Update UI buttons
        const speeds = { 0.25: 'speed025', 0.5: 'speedDown', 1: 'speedNormal', 2: 'speedUp' };
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

// Image viewer
const ImageViewer = {
    modal: null,
    image: null,

    init(imageElement, modalElement) {
        this.image = imageElement;
        this.modal = modalElement;
    },

    open(thumbUrl, fullUrl, title) {
        if (!this.image || !this.modal) return;

        this.image.src = thumbUrl; // Show thumb first for fast load
        document.getElementById('imageTitle').textContent = title;
        document.getElementById('downloadImage').href = fullUrl;

        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Load full resolution in background
        const fullImg = new Image();
        fullImg.onload = () => {
            this.image.src = fullUrl;
        };
        fullImg.src = fullUrl;
    },

    close() {
        if (!this.modal) return;
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Player, ImageViewer };
}
