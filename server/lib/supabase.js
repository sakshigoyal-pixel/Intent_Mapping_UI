/**
 * Supabase backend for queue, annotations, and timestamps.
 * Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to use Supabase.
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isConfigured = () => Boolean(url && serviceKey);

let client = null;
function getClient() {
    if (!client) {
        if (!isConfigured()) throw new Error('Supabase not configured');
        client = createClient(url, serviceKey);
    }
    return client;
}

// ── Queue ─────────────────────────────────────────────

const QUEUE_ROW_ID = 1;

async function readQueue() {
    const { data, error } = await getClient()
        .from('queue')
        .select('current_index, videos')
        .eq('id', QUEUE_ROW_ID)
        .single();
    if (error) {
        if (error.code === 'PGRST116') return { currentIndex: 0, videos: [] };
        throw error;
    }
    return {
        currentIndex: data.current_index ?? 0,
        videos: Array.isArray(data.videos) ? data.videos : [],
    };
}

async function writeQueue(q) {
    const { error } = await getClient()
        .from('queue')
        .upsert(
            {
                id: QUEUE_ROW_ID,
                current_index: q.currentIndex ?? 0,
                videos: q.videos ?? [],
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
        );
    if (error) throw error;
}

// ── Annotations ──────────────────────────────────────

function rowToAnnotation(row) {
    if (!row) return null;
    return {
        id: row.id,
        videoId: row.video_id ?? 'default',
        startTime: row.start_time,
        endTime: row.end_time,
        intent: row.intent,
        text: row.text ?? '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function annotationsGetAll(query = {}) {
    let q = getClient().from('annotations').select('*');
    if (query.videoId) q = q.eq('video_id', query.videoId);
    if (query.intent) q = q.eq('intent', query.intent);
    if (query.search) {
        q = q.or(`text.ilike.%${query.search}%,intent.ilike.%${query.search}%`);
    }
    q = query.sort === 'startTime'
        ? q.order('start_time', { ascending: true })
        : q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(rowToAnnotation);
}

async function annotationsGetById(id) {
    const { data, error } = await getClient()
        .from('annotations')
        .select('*')
        .eq('id', id)
        .single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return rowToAnnotation(data);
}

async function annotationsCreate(data) {
    const row = {
        video_id: data.videoId ?? 'default',
        start_time: data.startTime,
        end_time: data.endTime,
        intent: data.intent,
        text: data.text ?? '',
    };
    const { data: inserted, error } = await getClient()
        .from('annotations')
        .insert(row)
        .select()
        .single();
    if (error) throw error;
    return rowToAnnotation(inserted);
}

async function annotationsUpdate(id, data) {
    const updates = {};
    if (data.videoId !== undefined) updates.video_id = data.videoId;
    if (data.startTime !== undefined) updates.start_time = data.startTime;
    if (data.endTime !== undefined) updates.end_time = data.endTime;
    if (data.intent !== undefined) updates.intent = data.intent;
    if (data.text !== undefined) updates.text = data.text;
    updates.updated_at = new Date().toISOString();
    const { data: updated, error } = await getClient()
        .from('annotations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return updated ? rowToAnnotation(updated) : null;
}

async function annotationsRemove(id) {
    const { error } = await getClient().from('annotations').delete().eq('id', id);
    if (error) throw error;
    return true;
}

async function annotationsGetForExport(videoId) {
    let q = getClient().from('annotations').select('*').order('start_time', { ascending: true });
    if (videoId) q = q.eq('video_id', videoId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(rowToAnnotation);
}

// ── Timestamps (row-based: video_name, start, end strings) ───────────────────────────────────────

/** Parse time string to seconds: "00:12" -> 12, "01:30" -> 90, "45" -> 45 */
function parseTimeString(str) {
    if (str == null || typeof str !== 'string') return null;
    const s = str.trim();
    const mmss = s.match(/^(\d+):(\d{2})$/);
    if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

async function timestampsList() {
    const { data, error } = await getClient()
        .from('timestamp_rows')
        .select('video_name');
    if (error) throw error;
    const names = [...new Set((data || []).map((r) => r.video_name))];
    return { files: names };
}

async function timestampsGet(videoName) {
    const { data, error } = await getClient()
        .from('timestamp_rows')
        .select('start, end')
        .eq('video_name', videoName)
        .order('start', { ascending: true });
    if (error) throw error;
    const segments = (data || [])
        .map((row) => {
            const start = parseTimeString(row.start);
            const endVal = row.end != null ? row.end : row.end_sec;
            const end = parseTimeString(endVal);
            if (start != null && end != null && end > start) return { start, end };
            return null;
        })
        .filter(Boolean);
    return { videoName, segments };
}

async function timestampsUpsert(videoName, segments) {
    const rows = (segments || []).map(({ start, end }) => ({
        video_name: videoName,
        start: formatTime(start),
        end: formatTime(end),
    }));
    const { error: delErr } = await getClient()
        .from('timestamp_rows')
        .delete()
        .eq('video_name', videoName);
    if (delErr) throw delErr;
    if (rows.length) {
        const { error: insErr } = await getClient().from('timestamp_rows').insert(rows);
        if (insErr) throw insErr;
    }
    return { videoName, segments: segments || [], count: (segments || []).length };
}

function formatTime(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function timestampsBulkUpsert(entries) {
    const results = [];
    for (const { videoName, segments } of entries) {
        if (!videoName) continue;
        await timestampsUpsert(videoName, segments);
        results.push({ videoName, count: (segments || []).length });
    }
    return { uploaded: results.length, results };
}

/** Insert segments from row format (video_name, start, end as strings). Use for CSV import. */
async function timestampsAddRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0 };
    const toInsert = rows
        .filter((r) => r && r.video_name && (r.start != null || r.start_sec != null) && (r.end != null || r.end_sec != null))
        .map((r) => ({
            video_name: String(r.video_name).trim(),
            start: String(r.start != null ? r.start : r.start_sec || '').trim(),
            end: String(r.end != null ? r.end : r.end_sec || '').trim(),
        }));
    if (toInsert.length === 0) return { inserted: 0 };
    const { error } = await getClient().from('timestamp_rows').insert(toInsert);
    if (error) throw error;
    return { inserted: toInsert.length };
}

module.exports = {
    isConfigured,
    getClient,
    readQueue,
    writeQueue,
    annotations: {
        getAll: annotationsGetAll,
        getById: annotationsGetById,
        create: annotationsCreate,
        update: annotationsUpdate,
        remove: annotationsRemove,
        getForExport: annotationsGetForExport,
    },
    timestamps: {
        list: timestampsList,
        get: timestampsGet,
        upsert: timestampsUpsert,
        bulkUpsert: timestampsBulkUpsert,
        addRows: timestampsAddRows,
    },
};
