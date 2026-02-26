#!/usr/bin/env node
/**
 * Download (or copy) all videos from data/videos.json into data/cache/.
 * Run from server directory: node download-videos.js
 * Then start the server: node index.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const VIDEOS_CONFIG = path.join(DATA_DIR, 'videos.json');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

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
    return path.resolve(__dirname, u);
}

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

function getLocalVideoPath(videoName) {
    return path.join(CACHE_DIR, videoName + '.mp4');
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

async function main() {
    if (!fs.existsSync(VIDEOS_CONFIG)) {
        console.error('data/videos.json not found. Create it with a JSON array of video URLs.');
        process.exit(1);
    }
    const urls = JSON.parse(fs.readFileSync(VIDEOS_CONFIG, 'utf-8'));
    if (!Array.isArray(urls) || urls.length === 0) {
        console.log('videos.json is empty. Add video URLs (or file:// paths) and run again.');
        process.exit(0);
    }
    console.log(`Downloading ${urls.length} video(s) from videos.json into cache...\n`);
    for (const url of urls) {
        const u = (url && typeof url === 'string') ? url.trim() : '';
        if (!u) continue;
        const name = extractVideoName(u);
        const localPath = getLocalVideoPath(name);
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
            console.log(`  ✓ ${name} (already cached)`);
            continue;
        }
        if (isLocalFile(u)) {
            const srcPath = getLocalFilePath(u);
            if (!fs.existsSync(srcPath)) {
                console.error(`  ✗ Local file not found: ${srcPath}`);
                continue;
            }
            console.log(`  ↓ Copying ${name}...`);
            try {
                await copyLocalFile(srcPath, localPath);
                const size = fs.statSync(localPath).size;
                console.log(`  ✓ ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
            } catch (err) {
                console.error(`  ✗ Failed to copy ${name}: ${err.message}`);
            }
        } else {
            console.log(`  ↓ Downloading ${name}...`);
            try {
                await downloadFile(u, localPath);
                const size = fs.statSync(localPath).size;
                console.log(`  ✓ ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
            } catch (err) {
                console.error(`  ✗ Failed to download ${name}: ${err.message}`);
            }
        }
    }
    console.log('\nDone. Start server with: node index.js\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
