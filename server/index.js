require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabase = useSupabase ? require('./lib/supabase.js') : null;

const DATA_DIR = path.join(__dirname, 'data');
const TIMESTAMPS_DIR = path.join(DATA_DIR, 'timestamps');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const QUEUE_PATH = path.join(DATA_DIR, 'queue.json');
const VIDEOS_CONFIG = path.join(DATA_DIR, 'videos.json');
const DB_PATH = path.join(__dirname, 'db.json');

[DATA_DIR, TIMESTAMPS_DIR, CACHE_DIR, path.join(DATA_DIR, 'tmp')].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(DB_PATH))
    fs.writeFileSync(DB_PATH, JSON.stringify({ annotations: [] }, null, 2));

// Auto-build queue from videos.json config file on startup
function syncQueueFromConfig() {
    if (!fs.existsSync(VIDEOS_CONFIG)) {
        fs.writeFileSync(VIDEOS_CONFIG, JSON.stringify([], null, 2));
        console.log('  Created empty videos.json — add video URLs to server/data/videos.json');
    }

    const urls = JSON.parse(fs.readFileSync(VIDEOS_CONFIG, 'utf-8'));
    const existingQueue = fs.existsSync(QUEUE_PATH)
        ? JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'))
        : { currentIndex: 0, videos: [] };

    const existingNames = new Set(existingQueue.videos.map(v => v.name));
    const configNames = urls.map(url => ({ url: url.trim(), name: extractVideoName(url.trim()) }));

    const configNameSet = new Set(configNames.map(v => v.name));
    const added = configNames.filter(v => !existingNames.has(v.name));
    const removed = existingQueue.videos.filter(v => !configNameSet.has(v.name));

    if (added.length === 0 && removed.length === 0) {
        console.log(`  Queue: ${existingQueue.videos.length} videos (unchanged from videos.json)`);
        return;
    }

    // Keep existing videos that are still in config (preserve status), add new ones
    const merged = configNames.map(v => {
        const existing = existingQueue.videos.find(e => e.name === v.name);
        return existing || { url: v.url, name: v.name, status: 'pending' };
    });

    // Ensure at least one video is in_progress
    if (merged.length > 0 && !merged.some(v => v.status === 'in_progress')) {
        const first = merged.findIndex(v => v.status === 'pending');
        if (first !== -1) merged[first].status = 'in_progress';
    }

    const currentIdx = Math.min(
        existingQueue.currentIndex,
        Math.max(0, merged.length - 1)
    );

    const queue = { currentIndex: currentIdx, videos: merged };
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
    console.log(`  Queue synced: ${merged.length} videos (${added.length} added, ${removed.length} removed)`);
}

if (!useSupabase) syncQueueFromConfig();

// ── Download videos locally ──────────────────────────

function isLocalFile(url) {
    const u = (url || '').trim();
    return u.startsWith('file://') || path.isAbsolute(u) || u.startsWith('./') || u.startsWith('../');
}

function getLocalFilePath(url) {
    const u = (url || '').trim();
    if (u.startsWith('file://')) {
        try {
            return new URL(u).pathname;
        } catch {
            return u.slice(7);
        }
    }
    return path.resolve(u);
}

function copyLocalFile(srcPath, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const read = fs.createReadStream(srcPath);
        const write = fs.createWriteStream(dest);
        read.on('error', reject);
        write.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
        write.on('finish', () => write.close(resolve));
        read.pipe(write);
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const proto = url.startsWith('https') ? https : http;
        proto.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
            }
            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
        }).on('error', reject);
    });
}

function getLocalVideoPath(videoName) {
    return path.join(CACHE_DIR, videoName + '.mp4');
}

async function downloadAllVideos() {
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
    if (queue.videos.length === 0) return;

    let remoteDownloadFailed = false;
    console.log(`\n  Checking ${queue.videos.length} videos for local cache...`);
    for (const video of queue.videos) {
        const localPath = getLocalVideoPath(video.name);
        if (fs.existsSync(localPath)) {
            const size = fs.statSync(localPath).size;
            if (size > 0) {
                console.log(`  ✓ ${video.name} (cached, ${(size / 1024 / 1024).toFixed(1)} MB)`);
                continue;
            }
        }
        if (isLocalFile(video.url)) {
            const srcPath = getLocalFilePath(video.url);
            if (!fs.existsSync(srcPath)) {
                console.error(`  ✗ Local file not found: ${video.name} (${srcPath})`);
                continue;
            }
            console.log(`  ↓ Copying ${video.name} from local file...`);
            try {
                await copyLocalFile(srcPath, localPath);
                const size = fs.statSync(localPath).size;
                console.log(`  ✓ ${video.name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
            } catch (err) {
                console.error(`  ✗ Failed to copy ${video.name}: ${err.message}`);
            }
        } else {
            console.log(`  ↓ Downloading ${video.name}...`);
            try {
                await downloadFile(video.url, localPath);
                const size = fs.statSync(localPath).size;
                console.log(`  ✓ ${video.name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
            } catch (err) {
                console.error(`  ✗ Failed to download ${video.name}: ${err.message}`);
                remoteDownloadFailed = true;
            }
        }
    }
    console.log('  Video download check complete.\n');
    if (remoteDownloadFailed) {
        console.log('  Tip: Use local paths in data/videos.json if the remote host is unreachable:');
        console.log('       ["file:///absolute/path/to/video1.mp4", "./relative/video2.mp4"]');
        console.log('       Or put .mp4 files in server/data/cache/ (see queue for expected names).\n');
    }
}

downloadAllVideos();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ dest: path.join(DATA_DIR, 'tmp') });

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
});

// ── Utilities ────────────────────────────────────────

function extractVideoName(url) {
    if (isLocalFile(url)) {
        const p = getLocalFilePath(url);
        const parts = p.split(path.sep).filter(Boolean);
        const base = (parts[parts.length - 1] || 'video').replace(/\.[^.]+$/, '');
        const sub = parts[parts.length - 2];
        return sub ? `${sub}/${base}` : base;
    }
    try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        const last = parts[parts.length - 1].replace(/\.[^.]+$/, '');
        const secondLast = parts[parts.length - 2];
        return `${secondLast}/${last}`;
    } catch {
        return url.replace(/[^a-zA-Z0-9_/-]/g, '_');
    }
}

function parseTimestampCSV(content) {
    const lines = content.trim().split(/\r?\n/).filter(l => l.trim());
    const segments = [];
    for (const line of lines) {
        if (/^(start|time|#)/i.test(line.trim())) continue;
        const parts = line.trim().split(/[,\t;|\s]+/);
        if (parts.length < 2) continue;
        const start = parseTimeVal(parts[0]);
        const end = parseTimeVal(parts[1]);
        if (start !== null && end !== null && end > start) segments.push({ start, end });
    }
    return segments;
}

function parseTimeVal(str) {
    str = str.trim();
    const m = str.match(/^(\d+):(\d{2})$/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    const n = parseFloat(str);
    return isNaN(n) ? null : n;
}

// ── Queue ────────────────────────────────────────────

const readQueue = useSupabase
    ? () => supabase.readQueue()
    : () => Promise.resolve(JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8')));
const writeQueue = useSupabase
    ? (q) => supabase.writeQueue(q)
    : (q) => Promise.resolve(void fs.writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2)));


app.get('/api/queue', async (req, res) => {
    try {
        const queue = await readQueue();
        const enriched = await Promise.all(queue.videos.map(async (v) => {
            const csvPath = path.join(TIMESTAMPS_DIR, v.name + '.csv');
            const hasTs = useSupabase
                ? (await supabase.timestamps.get(v.name)).segments?.length > 0
                : fs.existsSync(csvPath);
            const localPath = getLocalVideoPath(v.name);
            const downloaded = fs.existsSync(localPath) && fs.statSync(localPath).size > 0;
            return {
                ...v,
                hasTimestamps: hasTs,
                downloaded,
                localUrl: downloaded ? `/api/video/${v.name}` : null,
            };
        }));
        res.json({
            currentIndex: queue.currentIndex,
            videos: enriched,
            timestampsSource: useSupabase ? 'supabase' : 'local',
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load queue' });
    }
});

app.post('/api/queue', async (req, res) => {
    const { videos } = req.body;
    if (!Array.isArray(videos) || videos.length === 0)
        return res.status(400).json({ error: 'videos must be a non-empty array of URLs' });
    const queue = {
        currentIndex: 0,
        videos: videos.map(url => ({
            url: url.trim(),
            name: extractVideoName(url.trim()),
            status: 'pending',
        })),
    };
    queue.videos[0].status = 'in_progress';
    try {
        await writeQueue(queue);
        const enriched = await Promise.all(queue.videos.map(async (v) => {
            const hasTs = useSupabase
                ? (await supabase.timestamps.get(v.name)).segments?.length > 0
                : fs.existsSync(path.join(TIMESTAMPS_DIR, v.name + '.csv'));
            return { ...v, hasTimestamps: hasTs };
        }));
        res.json({ currentIndex: queue.currentIndex, videos: enriched, timestampsSource: useSupabase ? 'supabase' : 'local' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save queue' });
    }
});

app.put('/api/queue/current', async (req, res) => {
    const { index } = req.body;
    try {
        const queue = await readQueue();
        if (index < 0 || index >= queue.videos.length)
            return res.status(400).json({ error: 'Invalid index' });
        queue.currentIndex = index;
        queue.videos.forEach((v, i) => {
            if (i < index && v.status !== 'completed') v.status = 'completed';
            if (i === index && v.status !== 'completed') v.status = 'in_progress';
        });
        await writeQueue(queue);
        const enriched = await Promise.all(queue.videos.map(async (v) => ({
            ...v,
            hasTimestamps: useSupabase
                ? (await supabase.timestamps.get(v.name)).segments?.length > 0
                : fs.existsSync(path.join(TIMESTAMPS_DIR, v.name + '.csv')),
        })));
        res.json({ currentIndex: queue.currentIndex, videos: enriched, timestampsSource: useSupabase ? 'supabase' : 'local' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update queue' });
    }
});

app.put('/api/queue/:index/complete', async (req, res) => {
    const idx = parseInt(req.params.index);
    try {
        const queue = await readQueue();
        if (idx < 0 || idx >= queue.videos.length)
            return res.status(400).json({ error: 'Invalid index' });
        queue.videos[idx].status = 'completed';
        if (idx === queue.currentIndex && idx < queue.videos.length - 1) {
            queue.currentIndex = idx + 1;
            queue.videos[idx + 1].status = 'in_progress';
        }
        await writeQueue(queue);
        const enriched = await Promise.all(queue.videos.map(async (v) => ({
            ...v,
            hasTimestamps: useSupabase
                ? (await supabase.timestamps.get(v.name)).segments?.length > 0
                : fs.existsSync(path.join(TIMESTAMPS_DIR, v.name + '.csv')),
        })));
        res.json({ currentIndex: queue.currentIndex, videos: enriched, timestampsSource: useSupabase ? 'supabase' : 'local' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update queue' });
    }
});

app.delete('/api/queue', async (req, res) => {
    try {
        await writeQueue({ currentIndex: 0, videos: [] });
        res.json({ currentIndex: 0, videos: [], timestampsSource: useSupabase ? 'supabase' : 'local' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to clear queue' });
    }
});

// ── Serve local videos ──────────────────────────────

app.get('/api/video/:folder/:file', (req, res) => {
    const videoName = `${req.params.folder}/${req.params.file}`;
    const localPath = getLocalVideoPath(videoName);

    if (!fs.existsSync(localPath)) {
        return res.status(404).json({ error: `Video not downloaded yet: ${videoName}` });
    }

    const stat = fs.statSync(localPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
        });
        fs.createReadStream(localPath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        });
        fs.createReadStream(localPath).pipe(res);
    }
});

app.get('/api/video-status', async (req, res) => {
    try {
        const queue = await readQueue();
        const status = queue.videos.map(v => {
            const p = getLocalVideoPath(v.name);
            const ok = fs.existsSync(p) && fs.statSync(p).size > 0;
            return { name: v.name, downloaded: ok, size: ok ? fs.statSync(p).size : 0 };
        });
        res.json({ videos: status });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load video status' });
    }
});

// ── Timestamps ───────────────────────────────────────

app.get('/api/timestamps', async (req, res) => {
    try {
        if (useSupabase) {
            const out = await supabase.timestamps.list();
            return res.json(out);
        }
        const files = [];
        function walk(dir, prefix = '') {
            if (!fs.existsSync(dir)) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
                else if (entry.name.endsWith('.csv')) files.push(rel.replace('.csv', ''));
            }
        }
        walk(TIMESTAMPS_DIR);
        res.json({ files });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to list timestamps' });
    }
});

app.get('/api/timestamps/:folder/:file', async (req, res) => {
    const videoName = `${req.params.folder}/${req.params.file}`;
    try {
        if (useSupabase) {
            const out = await supabase.timestamps.get(videoName);
            return res.json(out);
        }
        const csvPath = path.join(TIMESTAMPS_DIR, videoName + '.csv');
        if (!fs.existsSync(csvPath))
            return res.status(404).json({ error: `No timestamps for ${videoName}`, segments: [] });
        const content = fs.readFileSync(csvPath, 'utf-8');
        res.json({ videoName, segments: parseTimestampCSV(content) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to get timestamps' });
    }
});

app.post('/api/timestamps/upload', upload.single('csv'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No CSV file provided' });
    const videoName = req.body.videoName;
    if (!videoName) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'videoName is required' });
    }
    try {
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const segments = parseTimestampCSV(content);
        if (useSupabase) {
            await supabase.timestamps.upsert(videoName, segments);
            try { fs.unlinkSync(req.file.path); } catch (_) {}
            return res.json({ videoName, segments, count: segments.length });
        }
        const targetDir = path.join(TIMESTAMPS_DIR, path.dirname(videoName));
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const targetPath = path.join(TIMESTAMPS_DIR, videoName + '.csv');
        fs.renameSync(req.file.path, targetPath);
        res.json({ videoName, segments, count: segments.length });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to upload timestamps' });
    }
});

app.post('/api/timestamps/bulk', async (req, res) => {
    const { csvFiles } = req.body;
    if (!Array.isArray(csvFiles)) return res.status(400).json({ error: 'csvFiles array required' });
    try {
        if (useSupabase) {
            const entries = csvFiles
                .filter((f) => f.videoName && f.content)
                .map((f) => ({ videoName: f.videoName, segments: parseTimestampCSV(f.content) }));
            const out = await supabase.timestamps.bulkUpsert(entries);
            return res.json(out);
        }
        const results = [];
        for (const { videoName, content } of csvFiles) {
            if (!videoName || !content) continue;
            const targetDir = path.join(TIMESTAMPS_DIR, path.dirname(videoName));
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(path.join(TIMESTAMPS_DIR, videoName + '.csv'), content);
            results.push({ videoName, count: parseTimestampCSV(content).length });
        }
        res.json({ uploaded: results.length, results });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to bulk upload timestamps' });
    }
});

// Supabase only: add timestamp rows (video_name, start, end as strings, e.g. from CSV)
app.post('/api/timestamps/rows', async (req, res) => {
    if (!useSupabase) return res.status(400).json({ error: 'Row-based timestamps require Supabase' });
    const { rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array of { video_name, start, end }' });
    try {
        const result = await supabase.timestamps.addRows(rows);
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to add timestamp rows' });
    }
});

// ── Storage Layer ────────────────────────────────────

let storage;

if (useSupabase) {
    storage = {
        getAll: (query) => supabase.annotations.getAll(query),
        getById: (id) => supabase.annotations.getById(id),
        create: (data) => supabase.annotations.create(data),
        update: (id, data) => supabase.annotations.update(id, data),
        remove: (id) => supabase.annotations.remove(id),
        getForExport: (videoId) => supabase.annotations.getForExport(videoId),
    };
    console.log('  Using Supabase (annotations, queue, timestamps)');
} else if (MONGODB_URI) {
    const mongoose = require('mongoose');
    const Annotation = require('./models/Annotation');

    mongoose.connect(MONGODB_URI)
        .then(() => console.log('  Connected to MongoDB'))
        .catch(err => { console.error('MongoDB error:', err); process.exit(1); });

    storage = {
        getAll: async (query) => {
            let filter = {};
            if (query.videoId) filter.videoId = query.videoId;
            if (query.intent) filter.intent = query.intent;
            if (query.search) {
                const rx = new RegExp(query.search, 'i');
                filter.$or = [{ text: rx }, { intent: rx }];
            }
            const sort = query.sort === 'startTime' ? { startTime: 1 } : { createdAt: -1 };
            return Annotation.find(filter).sort(sort).lean().then(docs =>
                docs.map(d => ({ ...d, id: d._id.toString(), _id: undefined, __v: undefined }))
            );
        },
        getById: async (id) => {
            const doc = await Annotation.findById(id).lean();
            return doc ? { ...doc, id: doc._id.toString(), _id: undefined, __v: undefined } : null;
        },
        create: async (data) => (await Annotation.create(data)).toJSON(),
        update: async (id, data) => {
            const doc = await Annotation.findByIdAndUpdate(id, data, { new: true }).lean();
            return doc ? { ...doc, id: doc._id.toString(), _id: undefined, __v: undefined } : null;
        },
        remove: async (id) => !!(await Annotation.findByIdAndDelete(id)),
        getForExport: async (videoId) => {
            const filter = videoId ? { videoId } : {};
            return Annotation.find(filter).sort({ startTime: 1 }).lean().then(docs =>
                docs.map(d => ({ ...d, id: d._id.toString(), _id: undefined, __v: undefined }))
            );
        }
    };
} else {
    const readDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const writeDB = (d) => fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2));

    storage = {
        getAll: async (query) => {
            let results = readDB().annotations;
            if (query.videoId) results = results.filter(a => a.videoId === query.videoId);
            if (query.intent) results = results.filter(a => a.intent.toLowerCase() === query.intent.toLowerCase());
            if (query.search) {
                const t = query.search.toLowerCase();
                results = results.filter(a => (a.text || '').toLowerCase().includes(t) || a.intent.toLowerCase().includes(t));
            }
            if (query.sort === 'startTime') results.sort((a, b) => a.startTime - b.startTime);
            return results;
        },
        getById: async (id) => readDB().annotations.find(a => a.id === id) || null,
        create: async (data) => {
            const db = readDB();
            const ann = {
                id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                videoId: data.videoId || 'default',
                startTime: data.startTime,
                endTime: data.endTime,
                intent: data.intent,
                text: data.text || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            db.annotations.push(ann);
            writeDB(db);
            return ann;
        },
        update: async (id, data) => {
            const db = readDB();
            const idx = db.annotations.findIndex(a => a.id === id);
            if (idx === -1) return null;
            db.annotations[idx] = { ...db.annotations[idx], ...data, updatedAt: new Date().toISOString() };
            writeDB(db);
            return db.annotations[idx];
        },
        remove: async (id) => {
            const db = readDB();
            const len = db.annotations.length;
            db.annotations = db.annotations.filter(a => a.id !== id);
            writeDB(db);
            return db.annotations.length < len;
        },
        getForExport: async (videoId) => {
            let anns = readDB().annotations;
            if (videoId) anns = anns.filter(a => a.videoId === videoId);
            return anns;
        },
    };

    console.log('  Using local db.json (set SUPABASE_* or MONGODB_URI in .env for cloud)');
}

// ── Validation ───────────────────────────────────────

const validate = (body) => {
    const errors = [];
    if (body.startTime == null || typeof body.startTime !== 'number' || body.startTime < 0)
        errors.push('startTime must be a non-negative number');
    if (body.endTime == null || typeof body.endTime !== 'number' || body.endTime < 0)
        errors.push('endTime must be a non-negative number');
    if (body.startTime != null && body.endTime != null && body.endTime < body.startTime)
        errors.push('endTime must be >= startTime');
    if (!body.intent || typeof body.intent !== 'string')
        errors.push('intent is required');
    return errors;
};

// ── Annotation Routes ────────────────────────────────

app.get('/api/annotations', async (req, res) => {
    try { res.json(await storage.getAll(req.query)); }
    catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch annotations' }); }
});

app.get('/api/annotations/:id', async (req, res) => {
    try {
        const ann = await storage.getById(req.params.id);
        if (!ann) return res.status(404).json({ error: 'Not found' });
        res.json(ann);
    } catch (e) { res.status(500).json({ error: 'Failed to fetch annotation' }); }
});

app.post('/api/annotations', async (req, res) => {
    try {
        const errors = validate(req.body);
        if (errors.length) return res.status(400).json({ errors });
        res.status(201).json(await storage.create(req.body));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create annotation' }); }
});

app.put('/api/annotations/:id', async (req, res) => {
    try {
        const ann = await storage.update(req.params.id, req.body);
        if (!ann) return res.status(404).json({ error: 'Not found' });
        res.json(ann);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update annotation' }); }
});

app.delete('/api/annotations/:id', async (req, res) => {
    try {
        const deleted = await storage.remove(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.status(204).send();
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete annotation' }); }
});

app.get('/api/export/:format', async (req, res) => {
    try {
        const videoId = req.query.videoId;
        const annotations = await storage.getForExport(videoId);
        if (req.params.format === 'json') {
            res.setHeader('Content-Disposition', 'attachment; filename=annotations.json');
            res.json(annotations);
        } else if (req.params.format === 'csv') {
            const header = 'id,videoId,startTime,endTime,intent,text,createdAt\n';
            const rows = annotations.map(a =>
                `"${a.id}","${a.videoId || ''}",${a.startTime},${a.endTime},"${a.intent}","${(a.text || '').replace(/"/g, '""')}","${a.createdAt}"`
            ).join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=annotations.csv');
            res.send(header + rows);
        } else {
            res.status(400).json({ error: 'Use json or csv' });
        }
    } catch (e) { res.status(500).json({ error: 'Export failed' }); }
});

async function start() {
    if (useSupabase) {
        const q = await readQueue();
        if (q.videos.length === 0 && fs.existsSync(VIDEOS_CONFIG)) {
            const urls = JSON.parse(fs.readFileSync(VIDEOS_CONFIG, 'utf-8'));
            if (Array.isArray(urls) && urls.length > 0) {
                const configNames = urls.map((u) => ({
                    url: (typeof u === 'string' ? u : '').trim(),
                    name: extractVideoName((typeof u === 'string' ? u : '').trim()),
                })).filter((v) => v.url);
                if (configNames.length) {
                    const merged = configNames.map((v, i) => ({
                        ...v,
                        status: i === 0 ? 'in_progress' : 'pending',
                    }));
                    await writeQueue({ currentIndex: 0, videos: merged });
                    console.log(`  Queue synced from videos.json to Supabase (${merged.length} videos)`);
                }
            }
        } else if (q.videos.length > 0) {
            console.log(`  Queue: ${q.videos.length} videos (from Supabase)`);
        }
    }
    app.listen(PORT, () => {
        console.log(`\n  Video Annotation API Server`);
        console.log(`  Local:    http://localhost:${PORT}`);
        console.log(`  Database: ${useSupabase ? 'Supabase' : MONGODB_URI ? 'MongoDB' : 'Local db.json'}`);
        console.log(`  Timestamps: ${useSupabase ? 'Supabase' : TIMESTAMPS_DIR}\n`);
    });
}
start().catch((err) => {
    console.error(err);
    process.exit(1);
});
