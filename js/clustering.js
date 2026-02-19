/**
 * Clustering module for athlete re-identification.
 *
 * Takes CLIP embeddings from montage manifests and groups runs by the same
 * athlete using agglomerative clustering with cosine similarity.
 */

const Clustering = {
    ADMIN_API: 'https://skiframes-admin-api.avillach.workers.dev',

    /** Default color palette for athlete cards */
    COLORS: [
        '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
        '#db2777', '#0891b2', '#65a30d', '#ea580c', '#6366f1',
        '#0d9488', '#ca8a04', '#e11d48', '#4f46e5', '#059669'
    ],

    /**
     * Compute cosine similarity between two embedding vectors.
     * @param {number[]} a - First embedding
     * @param {number[]} b - Second embedding
     * @returns {number} Similarity in range [-1, 1]
     */
    cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dot / denom : 0;
    },

    /**
     * Agglomerative clustering of montages by embedding similarity.
     *
     * Algorithm:
     * 1. Start with each montage as its own cluster
     * 2. Find the two most similar clusters (average linkage)
     * 3. Merge them if similarity > threshold
     * 4. Repeat until no more merges possible
     *
     * @param {Object[]} montages - Array of montage objects with .embedding and .run_number
     * @param {number} threshold - Minimum cosine similarity to merge (default 0.92)
     * @param {Object} [savedClusters] - Previously saved cluster data with manual overrides
     * @returns {Object} Cluster assignments: { athlete_1: { label, run_numbers, color }, ... }
     */
    cluster(montages, threshold = 0.88, savedClusters = null) {
        // Filter montages that have embeddings, deduplicate by run_number
        // (all FPS variants of the same run share the same embedding)
        const seenRuns = new Set();
        const withEmbeddings = montages.filter(m => {
            if (!m.embedding || m.embedding.length === 0) return false;
            if (seenRuns.has(m.run_number)) return false;
            seenRuns.add(m.run_number);
            return true;
        });
        if (withEmbeddings.length === 0) return {};

        // Initialize: each run is its own cluster
        let clusters = withEmbeddings.map(m => ({
            runs: [m.run_number],
            embedding: m.embedding  // Will become centroid for multi-member clusters
        }));

        // Precompute all pairwise similarities
        const n = clusters.length;
        const simMatrix = new Array(n);
        for (let i = 0; i < n; i++) {
            simMatrix[i] = new Array(n);
            for (let j = 0; j < n; j++) {
                simMatrix[i][j] = i === j ? -1 :
                    this.cosineSimilarity(clusters[i].embedding, clusters[j].embedding);
            }
        }

        // Track which clusters are still active
        const active = new Array(n).fill(true);

        // Merge loop
        while (true) {
            // Find most similar pair among active clusters
            let bestSim = -1;
            let bestI = -1;
            let bestJ = -1;

            for (let i = 0; i < n; i++) {
                if (!active[i]) continue;
                for (let j = i + 1; j < n; j++) {
                    if (!active[j]) continue;
                    if (simMatrix[i][j] > bestSim) {
                        bestSim = simMatrix[i][j];
                        bestI = i;
                        bestJ = j;
                    }
                }
            }

            // Stop if no pair exceeds threshold
            if (bestSim < threshold || bestI === -1) break;

            // Merge j into i
            clusters[bestI].runs = clusters[bestI].runs.concat(clusters[bestJ].runs);

            // Update centroid (average of all member embeddings)
            const memberEmbeddings = clusters[bestI].runs.map(rn =>
                withEmbeddings.find(m => m.run_number === rn).embedding
            );
            clusters[bestI].embedding = this._averageEmbedding(memberEmbeddings);

            // Deactivate j
            active[bestJ] = false;

            // Update similarity matrix for merged cluster i
            for (let k = 0; k < n; k++) {
                if (!active[k] || k === bestI) continue;
                // Average linkage: recompute from centroid
                simMatrix[bestI][k] = this.cosineSimilarity(clusters[bestI].embedding, clusters[k].embedding);
                simMatrix[k][bestI] = simMatrix[bestI][k];
            }
        }

        // Build result object
        const result = {};
        let athleteIdx = 1;
        for (let i = 0; i < n; i++) {
            if (!active[i]) continue;
            const id = `athlete_${athleteIdx}`;
            result[id] = {
                label: `Athlete ${athleteIdx}`,
                color: this.COLORS[(athleteIdx - 1) % this.COLORS.length],
                representative_run: clusters[i].runs[0],
                run_numbers: clusters[i].runs.sort((a, b) => a - b)
            };
            athleteIdx++;
        }

        // Apply saved manual overrides if available
        if (savedClusters && savedClusters.manual_overrides) {
            this._applyOverrides(result, savedClusters.manual_overrides);
        }

        // Preserve saved labels if available
        if (savedClusters && savedClusters.clusters) {
            this._preserveLabels(result, savedClusters.clusters);
        }

        return result;
    },

    /**
     * Compute the element-wise average of multiple embedding vectors.
     */
    _averageEmbedding(embeddings) {
        if (embeddings.length === 0) return [];
        const dim = embeddings[0].length;
        const avg = new Array(dim).fill(0);
        for (const emb of embeddings) {
            for (let i = 0; i < dim; i++) {
                avg[i] += emb[i];
            }
        }
        for (let i = 0; i < dim; i++) {
            avg[i] /= embeddings.length;
        }
        return avg;
    },

    /**
     * Apply manual overrides: move runs between clusters.
     */
    _applyOverrides(clusters, overrides) {
        for (const [runNumStr, targetClusterId] of Object.entries(overrides)) {
            const runNum = parseInt(runNumStr);
            // Remove from current cluster
            for (const [id, cluster] of Object.entries(clusters)) {
                const idx = cluster.run_numbers.indexOf(runNum);
                if (idx !== -1) {
                    cluster.run_numbers.splice(idx, 1);
                    break;
                }
            }
            // Add to target cluster
            if (clusters[targetClusterId]) {
                clusters[targetClusterId].run_numbers.push(runNum);
                clusters[targetClusterId].run_numbers.sort((a, b) => a - b);
            }
        }
        // Remove empty clusters
        for (const [id, cluster] of Object.entries(clusters)) {
            if (cluster.run_numbers.length === 0) {
                delete clusters[id];
            }
        }
    },

    /**
     * Preserve user-assigned labels from saved clusters.
     * Matches by overlap in run_numbers.
     */
    _preserveLabels(newClusters, savedClusters) {
        for (const [newId, newCluster] of Object.entries(newClusters)) {
            let bestMatch = null;
            let bestOverlap = 0;

            for (const [savedId, savedCluster] of Object.entries(savedClusters)) {
                const overlap = newCluster.run_numbers.filter(
                    rn => savedCluster.run_numbers.includes(rn)
                ).length;
                if (overlap > bestOverlap) {
                    bestOverlap = overlap;
                    bestMatch = savedCluster;
                }
            }

            if (bestMatch && bestOverlap > 0) {
                // Preserve user-assigned label (not default "Athlete N" labels)
                if (!bestMatch.label.match(/^Athlete \d+$/)) {
                    newCluster.label = bestMatch.label;
                }
            }
        }
    },

    /**
     * Load saved cluster data from S3.
     * @param {string} eventId
     * @returns {Object|null} Saved cluster data or null
     */
    async loadSaved(eventId) {
        try {
            const url = `${API.MEDIA_BASE}/events/${eventId}/clusters.json?t=${Date.now()}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            return null;
        }
    },

    /**
     * Save cluster data to S3 via admin API.
     * @param {string} eventId
     * @param {Object} clusters - Cluster assignments
     * @param {Object} manualOverrides - Manual run reassignments
     */
    async save(eventId, clusters, manualOverrides = {}) {
        try {
            const data = {
                eventId: eventId,
                data: {
                    clusters: clusters,
                    manual_overrides: manualOverrides,
                    updated_at: new Date().toISOString()
                }
            };
            await fetch(`${this.ADMIN_API}/save-clusters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (e) {
            console.error('Failed to save clusters:', e);
        }
    }
};
