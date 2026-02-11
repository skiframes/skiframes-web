/**
 * Skiframes Admin API - Cloudflare Worker
 *
 * Handles deletion of training photos/sessions from S3.
 * Protected by Cloudflare Access.
 */

export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleCORS(request, env);
        }

        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const isAllowedOrigin = origin.includes('avillachlab-net-dev') || origin.includes('skiframes.com');

        // Skip auth for requests from allowed origins (dev and prod sites)
        // TODO: Re-enable Cloudflare Access auth once admin.skiframes.com is set up
        const skipAuth = isAllowedOrigin;

        // Verify Cloudflare Access JWT
        if (!skipAuth) {
            const authResult = await verifyAccess(request, env);
            if (!authResult.valid) {
                return new Response('Unauthorized: ' + authResult.error, {
                    status: 401,
                    headers: corsHeaders(env, request)
                });
            }
        }

        try {
            if (url.pathname === '/delete-items' && request.method === 'POST') {
                return await handleDeleteItems(request, env);
            }

            if (url.pathname === '/delete-event' && request.method === 'POST') {
                return await handleDeleteEvent(request, env);
            }

            if (url.pathname === '/save-banner-config' && request.method === 'POST') {
                return await handleSaveBannerConfig(request, env);
            }

            if (url.pathname === '/update-event' && request.method === 'POST') {
                return await handleUpdateEvent(request, env);
            }

            return new Response('Not Found', {
                status: 404,
                headers: corsHeaders(env, request)
            });
        } catch (error) {
            console.error('Error:', error);
            return new Response('Internal Error: ' + error.message, {
                status: 500,
                headers: corsHeaders(env, request)
            });
        }
    }
};

/**
 * Verify Cloudflare Access JWT
 */
async function verifyAccess(request, env) {
    const jwt = request.headers.get('CF-Access-JWT-Assertion');

    if (!jwt) {
        return { valid: false, error: 'No access token' };
    }

    try {
        // Verify with Cloudflare Access
        const certsUrl = `https://${env.CF_ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`;
        const certsResponse = await fetch(certsUrl);
        const certs = await certsResponse.json();

        // Decode JWT header to get key ID
        const [headerB64] = jwt.split('.');
        const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));

        // Find matching key
        const key = certs.keys.find(k => k.kid === header.kid);
        if (!key) {
            return { valid: false, error: 'Key not found' };
        }

        // Import the public key
        const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            key,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
        );

        // Verify signature
        const [, payloadB64, signatureB64] = jwt.split('.');
        const signatureData = Uint8Array.from(
            atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
            c => c.charCodeAt(0)
        );
        const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

        const valid = await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            cryptoKey,
            signatureData,
            signedData
        );

        if (!valid) {
            return { valid: false, error: 'Invalid signature' };
        }

        // Decode and verify payload
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

        // Check expiration
        if (payload.exp && payload.exp < Date.now() / 1000) {
            return { valid: false, error: 'Token expired' };
        }

        // Check audience if configured
        if (env.CF_ACCESS_AUD && payload.aud !== env.CF_ACCESS_AUD) {
            return { valid: false, error: 'Invalid audience' };
        }

        return { valid: true, email: payload.email };
    } catch (error) {
        console.error('Auth error:', error);
        return { valid: false, error: error.message };
    }
}

/**
 * Handle deletion of individual items
 */
async function handleDeleteItems(request, env) {
    const { items } = await request.json();

    if (!items || typeof items !== 'object') {
        return new Response('Invalid request body', {
            status: 400,
            headers: corsHeaders(env, request)
        });
    }

    const results = [];

    const invalidationPaths = [];

    for (const [eventId, itemList] of Object.entries(items)) {
        for (const item of itemList) {
            try {
                // Delete the file from S3
                const fullKey = `events/${eventId}/${item.path}`;
                await deleteFromS3(env, fullKey);
                invalidationPaths.push(`/${fullKey}`);

                // Also delete thumbnail if it exists
                // Handle both video (.mp4) and montage (.jpg) thumbnails
                // Thumbnails are in thumbnails/ dir with _thumb suffix
                let thumbPath;
                if (item.path.startsWith('fullres/')) {
                    // Montage: fullres/run_001.jpg -> thumbnails/run_001_thumb.jpg
                    thumbPath = item.path.replace('fullres/', 'thumbnails/').replace('.jpg', '_thumb.jpg');
                } else {
                    // Video or other: just add _thumb before extension
                    thumbPath = item.path.replace('.mp4', '_thumb.jpg').replace('.jpg', '_thumb.jpg');
                }
                try {
                    const thumbKey = `events/${eventId}/${thumbPath}`;
                    await deleteFromS3(env, thumbKey);
                    invalidationPaths.push(`/${thumbKey}`);
                } catch (e) {
                    // Thumbnail might not exist, that's OK
                }

                results.push({ eventId, itemId: item.id, success: true });
            } catch (error) {
                results.push({ eventId, itemId: item.id, success: false, error: error.message });
            }
        }

        // Update the manifest to remove deleted items
        await updateManifest(env, eventId, itemList.map(i => i.id), itemList.map(i => i.path));
        invalidationPaths.push(`/events/${eventId}/manifest.json`);
    }

    // Invalidate CloudFront cache for deleted items
    if (invalidationPaths.length > 0) {
        try {
            await invalidateCloudFrontPaths(env, invalidationPaths);
        } catch (e) {
            console.error('CloudFront invalidation failed (non-fatal):', e);
        }
    }

    return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(env, request)
        }
    });
}

/**
 * Handle saving live banner config
 */
async function handleSaveBannerConfig(request, env) {
    const config = await request.json();

    // Validate config
    if (typeof config.enabled !== 'boolean') {
        return new Response('Invalid config: enabled must be boolean', {
            status: 400,
            headers: corsHeaders(env, request)
        });
    }

    const bannerConfig = {
        enabled: config.enabled,
        title: config.title || '',
        subtitle: config.subtitle || '',
        raceStartTime: config.raceStartTime || null,
        updatedAt: new Date().toISOString()
    };

    // Save to S3 with no-cache headers to prevent CloudFront caching
    await putToS3(env, 'config/live-banner.json', JSON.stringify(bannerConfig, null, 2), {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    // Invalidate CloudFront cache for the config file
    try {
        await invalidateCloudFront(env, '/config/live-banner.json');
    } catch (e) {
        console.error('CloudFront invalidation failed:', e);
        // Don't fail the request if invalidation fails
    }

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(env, request)
        }
    });
}

/**
 * Handle updating event metadata
 */
async function handleUpdateEvent(request, env) {
    const { eventId, updates } = await request.json();

    if (!eventId || !updates) {
        return new Response('Missing eventId or updates', {
            status: 400,
            headers: corsHeaders(env, request)
        });
    }

    try {
        // Get current manifest
        const manifestKey = `events/${eventId}/manifest.json`;
        const manifest = await getFromS3(env, manifestKey);

        if (!manifest) {
            return new Response('Event not found', {
                status: 404,
                headers: corsHeaders(env, request)
            });
        }

        // Update manifest fields
        if (updates.event_name !== undefined) manifest.event_name = updates.event_name;
        if (updates.event_date !== undefined) manifest.event_date = updates.event_date;
        if (updates.event_type !== undefined) manifest.event_type = updates.event_type;
        if (updates.location !== undefined) manifest.location = updates.location;
        if (updates.discipline !== undefined) manifest.discipline = updates.discipline;

        // Save updated manifest
        await putToS3(env, manifestKey, JSON.stringify(manifest, null, 2));

        // Also update the root index.json
        const index = await getFromS3(env, 'index.json');
        if (index && index.events) {
            const eventIndex = index.events.findIndex(e => e.event_id === eventId);
            if (eventIndex !== -1) {
                if (updates.event_name !== undefined) index.events[eventIndex].event_name = updates.event_name;
                if (updates.event_date !== undefined) index.events[eventIndex].event_date = updates.event_date;
                if (updates.event_type !== undefined) index.events[eventIndex].event_type = updates.event_type;
                if (updates.location !== undefined) index.events[eventIndex].location = updates.location;
                if (updates.discipline !== undefined) index.events[eventIndex].discipline = updates.discipline;

                await putToS3(env, 'index.json', JSON.stringify(index, null, 2));
            }
        }

        // Invalidate CloudFront cache
        try {
            await invalidateCloudFrontPaths(env, [
                `/events/${eventId}/manifest.json`,
                '/index.json'
            ]);
        } catch (e) {
            console.error('CloudFront invalidation failed (non-fatal):', e);
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(env, request)
            }
        });
    } catch (error) {
        console.error('Update event error:', error);
        return new Response('Failed to update event: ' + error.message, {
            status: 500,
            headers: corsHeaders(env, request)
        });
    }
}

/**
 * Handle deletion of entire event
 */
async function handleDeleteEvent(request, env) {
    const { eventId } = await request.json();

    if (!eventId) {
        return new Response('Missing eventId', {
            status: 400,
            headers: corsHeaders(env, request)
        });
    }

    // List all objects in the event folder
    const objects = await listS3Objects(env, `events/${eventId}/`);

    // Delete all objects using batch delete (up to 1000 at a time)
    if (objects.length > 0) {
        const keys = objects.map(obj => obj.Key);
        await batchDeleteFromS3(env, keys);
    }

    // Update the root index to remove this event
    await updateRootIndex(env, eventId);

    return new Response(JSON.stringify({ success: true, deleted: objects.length }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(env, request)
        }
    });
}

/**
 * Delete an object from S3
 */
async function deleteFromS3(env, key) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const datetime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const host = `${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
    const url = `https://${host}/${key}`;

    const headers = {
        'Host': host,
        'x-amz-date': datetime,
        'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // empty body hash
    };

    // Sign the request
    const signedHeaders = await signRequest('DELETE', url, headers, '', env);

    const response = await fetch(url, {
        method: 'DELETE',
        headers: signedHeaders
    });

    if (!response.ok && response.status !== 404) {
        throw new Error(`S3 delete failed: ${response.status}`);
    }

    return true;
}

/**
 * Batch delete objects from S3 (up to 1000 at a time)
 */
async function batchDeleteFromS3(env, keys) {
    const datetime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const host = `${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
    const url = `https://${host}/?delete`;

    // Build XML body for DeleteObjects
    const objectsXml = keys.map(key => `<Object><Key>${escapeXml(key)}</Key></Object>`).join('');
    const body = `<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>${objectsXml}</Delete>`;

    const bodyHash = await sha256(body);

    // Calculate SHA256 checksum for x-amz-checksum-sha256 (base64 encoded)
    const checksumBase64 = await sha256Base64(body);

    const headers = {
        'Host': host,
        'x-amz-date': datetime,
        'x-amz-content-sha256': bodyHash,
        'x-amz-checksum-sha256': checksumBase64,
        'Content-Type': 'application/xml'
    };

    const signedHeaders = await signRequest('POST', url, headers, body, env);

    const response = await fetch(url, {
        method: 'POST',
        headers: signedHeaders,
        body: body
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`S3 batch delete failed: ${response.status} - ${text}`);
    }

    return true;
}

async function sha256Base64(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = new Uint8Array(hashBuffer);
    return btoa(String.fromCharCode(...hashArray));
}

function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Invalidate CloudFront cache for a path
 */
async function invalidateCloudFront(env, path) {
    const distributionId = env.MEDIA_CLOUDFRONT_ID;
    if (!distributionId) {
        console.log('No MEDIA_CLOUDFRONT_ID configured, skipping invalidation');
        return;
    }

    const datetime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const date = datetime.slice(0, 8);
    const callerReference = `invalidation-${Date.now()}`;

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<InvalidationBatch xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/">
  <CallerReference>${callerReference}</CallerReference>
  <Paths>
    <Quantity>1</Quantity>
    <Items>
      <Path>${path}</Path>
    </Items>
  </Paths>
</InvalidationBatch>`;

    const host = 'cloudfront.amazonaws.com';
    const url = `https://${host}/2020-05-31/distribution/${distributionId}/invalidation`;
    const bodyHash = await sha256(body);

    const headers = {
        'Host': host,
        'x-amz-date': datetime,
        'x-amz-content-sha256': bodyHash,
        'Content-Type': 'application/xml'
    };

    const signedHeaders = await signCloudFrontRequest('POST', url, headers, body, env);

    const response = await fetch(url, {
        method: 'POST',
        headers: signedHeaders,
        body: body
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`CloudFront invalidation failed: ${response.status} - ${text}`);
    }

    return true;
}

/**
 * Invalidate CloudFront cache for multiple paths
 */
async function invalidateCloudFrontPaths(env, paths) {
    const distributionId = env.MEDIA_CLOUDFRONT_ID;
    if (!distributionId) {
        console.log('No MEDIA_CLOUDFRONT_ID configured, skipping invalidation');
        return;
    }

    const datetime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const callerReference = `invalidation-${Date.now()}`;

    const itemsXml = paths.map(p => `      <Path>${escapeXml(p)}</Path>`).join('\n');
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<InvalidationBatch xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/">
  <CallerReference>${callerReference}</CallerReference>
  <Paths>
    <Quantity>${paths.length}</Quantity>
    <Items>
${itemsXml}
    </Items>
  </Paths>
</InvalidationBatch>`;

    const host = 'cloudfront.amazonaws.com';
    const url = `https://${host}/2020-05-31/distribution/${distributionId}/invalidation`;
    const bodyHash = await sha256(body);

    const headers = {
        'Host': host,
        'x-amz-date': datetime,
        'x-amz-content-sha256': bodyHash,
        'Content-Type': 'application/xml'
    };

    const signedHeaders = await signCloudFrontRequest('POST', url, headers, body, env);

    const response = await fetch(url, {
        method: 'POST',
        headers: signedHeaders,
        body: body
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`CloudFront invalidation failed: ${response.status} - ${text}`);
    }

    return true;
}

async function signCloudFrontRequest(method, url, headers, body, env) {
    const urlObj = new URL(url);
    const datetime = headers['x-amz-date'];
    const date = datetime.slice(0, 8);

    const service = 'cloudfront';
    const region = 'us-east-1'; // CloudFront is always us-east-1

    const signedHeaderNames = Object.keys(headers).sort().join(';').toLowerCase();
    const canonicalHeaders = Object.keys(headers)
        .sort()
        .map(k => `${k.toLowerCase()}:${headers[k]}`)
        .join('\n') + '\n';

    const payloadHash = headers['x-amz-content-sha256'];

    const canonicalRequest = [
        method,
        urlObj.pathname,
        '',
        canonicalHeaders,
        signedHeaderNames,
        payloadHash
    ].join('\n');

    const scope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        datetime,
        scope,
        await sha256(canonicalRequest)
    ].join('\n');

    const kDate = await hmac('AWS4' + env.AWS_SECRET_ACCESS_KEY, date);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, 'aws4_request');
    const signature = await hmacHex(kSigning, stringToSign);

    headers['Authorization'] = [
        `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}`,
        `SignedHeaders=${signedHeaderNames}`,
        `Signature=${signature}`
    ].join(', ');

    return headers;
}

/**
 * List objects in S3 bucket with prefix
 */
async function listS3Objects(env, prefix) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const datetime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const host = `${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
    const url = `https://${host}/?list-type=2&prefix=${encodeURIComponent(prefix)}`;

    const headers = {
        'Host': host,
        'x-amz-date': datetime,
        'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    };

    const signedHeaders = await signRequest('GET', url, headers, '', env);

    const response = await fetch(url, {
        method: 'GET',
        headers: signedHeaders
    });

    if (!response.ok) {
        throw new Error(`S3 list failed: ${response.status}`);
    }

    const xml = await response.text();

    // Parse XML response (simple regex for Contents/Key)
    const objects = [];
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    let match;
    while ((match = keyRegex.exec(xml)) !== null) {
        objects.push({ Key: match[1] });
    }

    return objects;
}

/**
 * Update manifest to remove deleted items
 */
async function updateManifest(env, eventId, deletedIds, deletedPaths) {
    try {
        // Get current manifest
        const manifestKey = `events/${eventId}/manifest.json`;
        const manifest = await getFromS3(env, manifestKey);

        if (!manifest) return;

        // Remove deleted items from skiframes-web format
        if (manifest.content?.videos) {
            manifest.content.videos = manifest.content.videos.filter(
                v => !deletedIds.includes(v.id)
            );
        }

        if (manifest.content?.montages) {
            manifest.content.montages = manifest.content.montages.filter(
                m => !deletedIds.includes(m.id)
            );
        }

        // For photo-montages stitcher format
        if (manifest.videos) {
            manifest.videos = manifest.videos.filter(
                v => !deletedIds.includes(v.id)
            );
        }

        // For photo-montages edge format (runs[] with variants)
        if (manifest.runs && Array.isArray(manifest.runs) && deletedPaths) {
            const pathSet = new Set(deletedPaths);
            manifest.runs = manifest.runs.filter(run => {
                if (!run.variants) return true;
                // Remove variants whose fullres path was deleted
                for (const [variantName, variant] of Object.entries(run.variants)) {
                    if (pathSet.has(variant.fullres)) {
                        delete run.variants[variantName];
                    }
                }
                // Keep run only if it still has variants
                return Object.keys(run.variants).length > 0;
            });
        }

        // Save updated manifest
        await putToS3(env, manifestKey, JSON.stringify(manifest, null, 2));
    } catch (error) {
        console.error('Error updating manifest:', error);
    }
}

/**
 * Update root index to remove an event
 */
async function updateRootIndex(env, eventId) {
    try {
        const index = await getFromS3(env, 'index.json');

        if (!index) return;

        if (index.events) {
            index.events = index.events.filter(e => e.event_id !== eventId);
        }

        await putToS3(env, 'index.json', JSON.stringify(index, null, 2));
    } catch (error) {
        console.error('Error updating index:', error);
    }
}

/**
 * Get an object from S3
 */
async function getFromS3(env, key) {
    const datetime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const host = `${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
    const url = `https://${host}/${key}`;

    const headers = {
        'Host': host,
        'x-amz-date': datetime,
        'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    };

    const signedHeaders = await signRequest('GET', url, headers, '', env);

    const response = await fetch(url, {
        method: 'GET',
        headers: signedHeaders
    });

    if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`S3 get failed: ${response.status}`);
    }

    return await response.json();
}

/**
 * Put an object to S3
 */
async function putToS3(env, key, body, extraHeaders = {}) {
    const datetime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const bodyHash = await sha256(body);

    const host = `${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
    const url = `https://${host}/${key}`;

    const headers = {
        'Host': host,
        'x-amz-date': datetime,
        'x-amz-content-sha256': bodyHash,
        'Content-Type': 'application/json',
        ...extraHeaders
    };

    const signedHeaders = await signRequest('PUT', url, headers, body, env);

    const response = await fetch(url, {
        method: 'PUT',
        headers: signedHeaders,
        body: body
    });

    if (!response.ok) {
        throw new Error(`S3 put failed: ${response.status}`);
    }

    return true;
}

/**
 * AWS Signature Version 4 signing
 */
async function signRequest(method, url, headers, body, env) {
    const urlObj = new URL(url);
    const datetime = headers['x-amz-date'];
    const date = datetime.slice(0, 8);

    const service = 's3';
    const region = env.S3_REGION;

    // Create canonical request
    const signedHeaderNames = Object.keys(headers).sort().join(';').toLowerCase();
    const canonicalHeaders = Object.keys(headers)
        .sort()
        .map(k => `${k.toLowerCase()}:${headers[k]}`)
        .join('\n') + '\n';

    const payloadHash = headers['x-amz-content-sha256'];

    // Build canonical query string - handle params without values (like ?delete)
    let canonicalQueryString = '';
    if (urlObj.search) {
        const params = [];
        urlObj.searchParams.forEach((value, key) => {
            params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        });
        // Handle case where search is just "?delete" (no value)
        if (params.length === 0 && urlObj.search.length > 1) {
            const key = urlObj.search.slice(1).split('=')[0];
            params.push(`${encodeURIComponent(key)}=`);
        }
        params.sort();
        canonicalQueryString = params.join('&');
    }

    const canonicalRequest = [
        method,
        urlObj.pathname,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaderNames,
        payloadHash
    ].join('\n');

    // Create string to sign
    const scope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        datetime,
        scope,
        await sha256(canonicalRequest)
    ].join('\n');

    // Calculate signature
    const kDate = await hmac('AWS4' + env.AWS_SECRET_ACCESS_KEY, date);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, 'aws4_request');
    const signature = await hmacHex(kSigning, stringToSign);

    // Add authorization header
    headers['Authorization'] = [
        `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}`,
        `SignedHeaders=${signedHeaderNames}`,
        `Signature=${signature}`
    ].join(', ');

    return headers;
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, message) {
    const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    const msgData = new TextEncoder().encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, msgData));
}

async function hmacHex(key, message) {
    const result = await hmac(key, message);
    return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(env, request) {
    const origin = request?.headers?.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '*').split(',');
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, CF-Access-JWT-Assertion',
        'Access-Control-Allow-Credentials': 'true'
    };
}

function handleCORS(request, env) {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(env, request)
    });
}
