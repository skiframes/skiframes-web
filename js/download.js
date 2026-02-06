/**
 * Download module for individual and bulk downloads
 */

const Download = {
    // Selected items for bulk download
    selected: new Set(),

    // Download queue
    queue: [],
    isProcessing: false,

    /**
     * Add item to selection
     */
    select(itemId) {
        this.selected.add(itemId);
        this.updateSelectionUI();
    },

    /**
     * Remove item from selection
     */
    deselect(itemId) {
        this.selected.delete(itemId);
        this.updateSelectionUI();
    },

    /**
     * Toggle item selection
     */
    toggle(itemId) {
        if (this.selected.has(itemId)) {
            this.deselect(itemId);
        } else {
            this.select(itemId);
        }
    },

    /**
     * Check if item is selected
     */
    isSelected(itemId) {
        return this.selected.has(itemId);
    },

    /**
     * Select all visible items
     */
    selectAll(itemIds) {
        itemIds.forEach(id => this.selected.add(id));
        this.updateSelectionUI();
    },

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selected.clear();
        this.updateSelectionUI();
    },

    /**
     * Get selected count
     */
    getSelectedCount() {
        return this.selected.size;
    },

    /**
     * Update selection UI
     */
    updateSelectionUI() {
        const countEl = document.getElementById('selectionCount');
        const downloadBtn = document.getElementById('downloadSelected');

        if (countEl) {
            countEl.textContent = `${this.selected.size} items selected`;
        }

        if (downloadBtn) {
            downloadBtn.disabled = this.selected.size === 0;
        }

        // Update checkbox states
        this.selected.forEach(id => {
            const checkbox = document.querySelector(`[data-item-id="${id}"] input[type="checkbox"]`);
            if (checkbox) checkbox.checked = true;
        });

        document.querySelectorAll('.video-card input[type="checkbox"]').forEach(checkbox => {
            const card = checkbox.closest('[data-item-id]');
            if (card && !this.selected.has(card.dataset.itemId)) {
                checkbox.checked = false;
            }
        });
    },

    /**
     * Download a single file using fetch+blob to force download
     */
    async downloadSingle(url, filename) {
        const finalFilename = filename || this.getFilenameFromUrl(url);

        try {
            // Use fetch + blob to force download instead of browser playing the file
            const response = await fetch(url);
            if (!response.ok) throw new Error('Fetch failed');

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = finalFilename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Clean up blob URL after a short delay
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        } catch (error) {
            console.error('Download failed, falling back to direct link:', error);
            // Fallback to direct download attempt
            const a = document.createElement('a');
            a.href = url;
            a.download = finalFilename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    },

    /**
     * Download selected items
     * For multiple files, downloads them sequentially with a delay
     */
    async downloadSelected(items) {
        const selectedItems = items.filter(item => this.selected.has(item.id));

        if (selectedItems.length === 0) return;

        // For a single item, just download directly
        if (selectedItems.length === 1) {
            const item = selectedItems[0];
            this.downloadSingle(item.url, item.filename);
            return;
        }

        // For multiple items, use download queue
        this.showProgress();
        this.queue = [...selectedItems];
        this.isProcessing = true;

        let completed = 0;
        const total = this.queue.length;

        for (const item of this.queue) {
            if (!this.isProcessing) break; // Check for cancellation

            this.updateProgress(completed, total, item.filename);

            // Download the file
            this.downloadSingle(item.url, item.filename);

            completed++;

            // Small delay between downloads to prevent browser blocking
            if (completed < total) {
                await this.delay(500);
            }
        }

        this.hideProgress();
        this.isProcessing = false;

        // Clear selection after download
        this.clearSelection();
    },

    /**
     * Download all items for a team as a ZIP file with folder structure:
     * - Videos/Men/
     * - Videos/Women/
     * - vs Fastest/Men/
     * - vs Fastest/Women/
     * - Photo Montages/Men/
     * - Photo Montages/Women/
     */
    async downloadByTeam(videos, comparisonVideos, montages, team, eventId) {
        // Filter by team
        const teamVideos = videos.filter(v => v.team === team);
        const teamComparisons = comparisonVideos.filter(v => v.team === team);
        const teamMontages = montages.filter(m => m.team === team);

        const totalItems = teamVideos.length + teamComparisons.length + teamMontages.length;

        if (totalItems === 0) {
            alert(`No items found for team ${team}`);
            return;
        }

        // Check if JSZip is available
        if (typeof JSZip === 'undefined') {
            alert('ZIP download not available. Please download items individually.');
            return;
        }

        this.showProgress();
        this.isProcessing = true;

        const zip = new JSZip();
        let completed = 0;

        // Helper to add file to zip
        const addToZip = async (url, folderPath, filename) => {
            if (!this.isProcessing) return;
            this.updateProgress(completed, totalItems, `Fetching ${filename}`);
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                zip.file(`${folderPath}/${filename}`, blob);
            } catch (error) {
                console.error(`Failed to fetch ${filename}:`, error);
            }
            completed++;
        };

        // Add regular videos
        for (const v of teamVideos) {
            const folder = `Videos/${v.gender}`;
            const filename = `${v.athlete.replace(/\s+/g, '_')}_Bib${v.bib}.mp4`;
            const url = API.getMediaUrl(v.video_url, eventId);
            await addToZip(url, folder, filename);
        }

        // Add comparison videos (vs Fastest)
        for (const v of teamComparisons) {
            const folder = `vs Fastest/${v.gender}`;
            const filename = `${v.athlete.replace(/\s+/g, '_')}_Bib${v.bib}_vs_Fastest.mp4`;
            const url = API.getMediaUrl(v.video_url, eventId);
            await addToZip(url, folder, filename);
        }

        // Add photo montages
        for (const m of teamMontages) {
            const folder = `Photo Montages/${m.gender || 'Other'}`;
            const filename = m.filename || `montage_${m.id}.jpg`;
            const url = API.getMediaUrl(m.full_url, eventId);
            await addToZip(url, folder, filename);
        }

        if (this.isProcessing) {
            this.updateProgress(totalItems, totalItems, 'Creating ZIP file...');

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);

            this.downloadSingle(url, `${team}_all_content.zip`);
            URL.revokeObjectURL(url);
        }

        this.hideProgress();
        this.isProcessing = false;
    },

    /**
     * Show download progress UI
     */
    showProgress() {
        const progressEl = document.getElementById('downloadProgress');
        if (progressEl) {
            progressEl.style.display = 'block';
        }
    },

    /**
     * Hide download progress UI
     */
    hideProgress() {
        const progressEl = document.getElementById('downloadProgress');
        if (progressEl) {
            progressEl.style.display = 'none';
        }
    },

    /**
     * Update progress UI
     */
    updateProgress(completed, total, currentFile) {
        const fillEl = document.getElementById('progressFill');
        const textEl = document.getElementById('progressText');

        if (fillEl) {
            const percent = (completed / total) * 100;
            fillEl.style.width = `${percent}%`;
        }

        if (textEl) {
            textEl.textContent = `${completed} of ${total} files - ${currentFile}`;
        }
    },

    /**
     * Cancel download queue
     */
    cancelDownload() {
        this.isProcessing = false;
        this.queue = [];
        this.hideProgress();
    },

    /**
     * Helper: Get filename from URL
     */
    getFilenameFromUrl(url) {
        return url.split('/').pop().split('?')[0];
    },

    /**
     * Helper: Delay for async operations
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Generate a ZIP file for bulk download (requires JSZip library)
     * Falls back to sequential downloads if JSZip not available
     */
    async downloadAsZip(items, zipName = 'skiframes-download.zip') {
        // Check if JSZip is available
        if (typeof JSZip === 'undefined') {
            console.log('JSZip not available, falling back to sequential downloads');
            return this.downloadSelected(items);
        }

        this.showProgress();
        this.isProcessing = true;

        const zip = new JSZip();
        let completed = 0;
        const total = items.length;

        for (const item of items) {
            if (!this.isProcessing) break;

            this.updateProgress(completed, total, `Fetching ${item.filename}`);

            try {
                const response = await fetch(item.url);
                const blob = await response.blob();
                zip.file(item.filename, blob);
            } catch (error) {
                console.error(`Failed to fetch ${item.filename}:`, error);
            }

            completed++;
        }

        if (this.isProcessing) {
            this.updateProgress(total, total, 'Creating ZIP file...');

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);

            this.downloadSingle(url, zipName);
            URL.revokeObjectURL(url);
        }

        this.hideProgress();
        this.isProcessing = false;
        this.clearSelection();
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Download;
}
