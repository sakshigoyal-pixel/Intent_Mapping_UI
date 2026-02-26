import { useState, useEffect } from 'react';
import { queueService, timestampService } from '../services/api';
import { Upload, CheckCircle2, XCircle, Loader2, Play, Trash2, FileText } from 'lucide-react';
import { toast } from 'react-toastify';

const QueueSetup = ({ onQueueReady }) => {
    const [urlInput, setUrlInput] = useState('');
    const [queue, setQueue] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadQueue();
    }, []);

    const loadQueue = async () => {
        try {
            const res = await queueService.get();
            if (res.data.videos.length > 0) setQueue(res.data);
        } catch { /* empty queue */ }
        finally { setLoading(false); }
    };

    const handleSetQueue = async () => {
        const urls = urlInput.trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (urls.length === 0) { toast.warn('Paste at least one video URL'); return; }
        setSubmitting(true);
        try {
            const res = await queueService.set(urls);
            setQueue(res.data);
            toast.success(`Loaded ${res.data.videos.length} videos`);
        } catch (err) { toast.error(err.message); }
        finally { setSubmitting(false); }
    };

    const handleCsvUpload = async (videoName, file) => {
        try {
            await timestampService.upload(videoName, file);
            toast.success(`Timestamps uploaded for ${videoName.split('/').pop()}`);
            const res = await queueService.get();
            setQueue(res.data);
        } catch (err) { toast.error(err.message); }
    };

    const handleClearQueue = async () => {
        try {
            await queueService.clear();
            setQueue(null);
            setUrlInput('');
            toast.success('Queue cleared');
        } catch (err) { toast.error(err.message); }
    };

    const handleStart = () => {
        if (queue) onQueueReady(queue);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin" size={24} style={{ color: 'var(--accent)' }} />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="glass-morphism rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Video Queue Setup</h2>

                {!queue ? (
                    <>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Paste video URLs below, one per line. The system will extract the video name from each URL to match with timestamp CSVs.
                        </p>
                        <textarea
                            value={urlInput}
                            onChange={e => setUrlInput(e.target.value)}
                            rows={8}
                            className="input-field w-full text-sm font-mono resize-none"
                            placeholder={`https://optometry.lenskart.com/ENGAGEMENT_VIDEOS/PZtAnPMrTPOhc9BuhUuzVw/V6ajJe41RwqjZIiUV5f59A.mp4\nhttps://optometry.lenskart.com/ENGAGEMENT_VIDEOS/abc123/def456.mp4`}
                        />
                        <button onClick={handleSetQueue} disabled={submitting} className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2">
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            Load Videos
                        </button>
                    </>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                {queue.videos.length} video{queue.videos.length !== 1 ? 's' : ''} in queue.
                                Upload timestamp CSVs for each video, then start annotating.
                            </p>
                            <button onClick={handleClearQueue} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
                                <Trash2 size={13} /> Clear Queue
                            </button>
                        </div>

                        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)', width: 40 }}>#</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Video Name</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)', width: 120 }}>Timestamps</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)', width: 140 }}>Upload CSV</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.videos.map((video, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                                            <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="text-xs font-mono truncate max-w-[400px]" style={{ color: 'var(--text-primary)' }} title={video.url}>
                                                    {video.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {video.hasTimestamps ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success)' }}>
                                                        <CheckCircle2 size={14} /> Ready
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                                        <XCircle size={14} /> Missing
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer inline-flex items-center gap-1.5">
                                                    <FileText size={13} /> Upload
                                                    <input
                                                        type="file"
                                                        accept=".csv,.txt"
                                                        className="hidden"
                                                        onChange={e => {
                                                            const file = e.target.files[0];
                                                            if (file) handleCsvUpload(video.name, file);
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                </label>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {queue.videos.filter(v => v.hasTimestamps).length} / {queue.videos.length} videos have timestamps
                            </p>
                            <button
                                onClick={handleStart}
                                className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2"
                            >
                                <Play size={16} /> Start Annotating
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default QueueSetup;
