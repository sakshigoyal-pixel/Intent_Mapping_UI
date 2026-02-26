import { useState } from 'react';
import { Upload, ClipboardPaste, AlertCircle } from 'lucide-react';
import { secondsToMMSS, mmssToSeconds } from '../utils/time';

const PLACEHOLDER = `Paste timestamps, one per line:
00:10 00:25
00:30 00:55
01:10 01:40

Also accepts: comma, tab, or semicolon separated`;

const parseLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase().startsWith('start') || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

    const parts = trimmed.split(/[,\t;|\s]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;

    const toSec = (val) => {
        if (val.includes(':')) return mmssToSeconds(val);
        const n = parseFloat(val);
        return isNaN(n) ? null : Math.max(0, n);
    };

    const start = toSec(parts[0]);
    const end = toSec(parts[1]);
    if (start === null || end === null) return null;
    if (end <= start) return null;
    return { start, end };
};

const parseText = (text) => {
    const lines = text.split('\n');
    return lines.map(parseLine).filter(Boolean);
};

const TimestampLoader = ({ onLoad }) => {
    const [text, setText] = useState('');
    const [error, setError] = useState('');

    const handleLoad = () => {
        setError('');
        const segments = parseText(text);
        if (segments.length > 0) {
            onLoad(segments);
        } else {
            setError('No valid timestamps found. Use format: MM:SS, MM:SS or seconds, seconds (one pair per line)');
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setError('');
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target.result;

            if (file.name.endsWith('.json')) {
                try {
                    const data = JSON.parse(content);
                    const arr = Array.isArray(data) ? data : data.segments || data.timestamps || data.ranges || [];
                    const segments = arr.map(item => {
                        if (Array.isArray(item)) return { start: Number(item[0]), end: Number(item[1]) };
                        if (item.start != null && item.end != null) return { start: Number(item.start), end: Number(item.end) };
                        if (item.startTime != null && item.endTime != null) return { start: Number(item.startTime), end: Number(item.endTime) };
                        return null;
                    }).filter(s => s && s.end > s.start);

                    if (segments.length > 0) {
                        onLoad(segments);
                    } else {
                        setError('No valid timestamp pairs found in JSON file');
                    }
                } catch {
                    setError('Invalid JSON file');
                }
            } else {
                const segments = parseText(content);
                if (segments.length > 0) {
                    onLoad(segments);
                } else {
                    setText(content);
                    setError('Could not auto-parse file. Check the format and click Load Timestamps.');
                }
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return (
        <div className="glass-morphism rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <ClipboardPaste size={16} style={{ color: 'var(--accent)' }} />
                Load Timestamp Ranges
            </h3>

            <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setError(''); }}
                placeholder={PLACEHOLDER}
                className="input-field w-full h-40 resize-none text-sm font-mono leading-relaxed"
            />

            {error && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            <div className="flex gap-3">
                <button onClick={handleLoad} disabled={!text.trim()} className="btn-primary text-sm flex-1 flex items-center justify-center gap-2">
                    <ClipboardPaste size={14} />
                    Load Timestamps
                </button>
                <label className="btn-secondary text-sm flex items-center gap-2 cursor-pointer">
                    <Upload size={14} />
                    Upload File
                    <input type="file" className="hidden" accept=".csv,.txt,.json,.tsv" onChange={handleFileUpload} />
                </label>
            </div>

            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Format: one timestamp pair per line, comma or tab separated. Accepts MM:SS or raw seconds. Also supports JSON files with arrays like [[10,25],[30,55]].
            </p>
        </div>
    );
};

export default TimestampLoader;
