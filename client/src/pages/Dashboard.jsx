import { useState, useRef, useEffect, useCallback } from 'react';
import VideoPlayer from '../components/VideoPlayer';
import SegmentReviewer from '../components/SegmentReviewer';
import AnnotationLogTable from '../components/AnnotationLogTable';
import { useAnnotations, INTENTS } from '../context/AnnotationContext';
import { queueService, timestampService } from '../services/api';
import { Search, X, Filter, ChevronRight, Check, Loader2, Video, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'react-toastify';

const Dashboard = () => {
    const [queue, setQueue] = useState(null);
    const [segments, setSegments] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const videoRef = useRef(null);

    const {
        setCurrentVideoId,
        searchTerm, setSearchTerm,
        filterIntent, setFilterIntent,
    } = useAnnotations();

    useEffect(() => { loadQueue(); }, []);

    const loadQueue = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await queueService.get();
            const videos = res.data?.videos;
            if (Array.isArray(videos) && videos.length > 0) {
                setQueue(res.data);
                await activateVideo(res.data, res.data.currentIndex);
            } else {
                setLoadError('empty');
            }
        } catch (err) {
            console.error('Failed to load queue:', err);
            setLoadError(err.message || 'Cannot reach server');
        } finally {
            setLoading(false);
        }
    };

    const activateVideo = useCallback(async (q, idx) => {
        const video = q.videos[idx];
        if (!video) return;
        setCurrentVideoId(video.name);
        try {
            const res = await timestampService.get(video.name);
            setSegments(res.data.segments);
        } catch {
            setSegments(null);
        }
    }, [setCurrentVideoId]);

    const handleNextVideo = async () => {
        if (!queue) return;
        const idx = queue.currentIndex;
        if (idx >= queue.videos.length - 1) {
            toast.success('All videos processed!');
            return;
        }
        try {
            const res = await queueService.complete(idx);
            setQueue(res.data);
            await activateVideo(res.data, res.data.currentIndex);
            setCurrentTime(0);
            setDuration(0);
        } catch (err) { toast.error(err.message); }
    };

    const handlePrevVideo = async () => {
        if (!queue || queue.currentIndex <= 0) return;
        try {
            const res = await queueService.setCurrent(queue.currentIndex - 1);
            setQueue(res.data);
            await activateVideo(res.data, res.data.currentIndex);
            setCurrentTime(0);
            setDuration(0);
        } catch (err) { toast.error(err.message); }
    };

    const handleJumpToVideo = async (idx) => {
        if (!queue || idx === queue.currentIndex) return;
        try {
            const res = await queueService.setCurrent(idx);
            setQueue(res.data);
            await activateVideo(res.data, res.data.currentIndex);
            setCurrentTime(0);
            setDuration(0);
        } catch (err) { toast.error(err.message); }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
            </div>
        );
    }

    if (!queue || queue.videos.length === 0) {
        const isConnectionError = loadError && loadError !== 'empty';
        return (
            <div className="h-full flex items-center justify-center p-6">
                <div className="glass-morphism rounded-2xl p-8 max-w-lg text-center space-y-4">
                    <FileText size={40} style={{ color: 'var(--text-muted)' }} className="mx-auto" />
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {isConnectionError ? 'Cannot Reach Server' : 'No Videos Configured'}
                    </h2>
                    {isConnectionError ? (
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Make sure the backend is running at <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-base)', color: 'var(--accent)' }}>http://localhost:5001</code> and try again.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                Add video URLs to the config file and restart the server:
                            </p>
                            <code className="block text-xs font-mono px-4 py-3 rounded-lg text-left" style={{ background: 'var(--bg-base)', color: 'var(--accent)', border: '1px solid var(--border-default)' }}>
                                server/data/videos.json
                            </code>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Format: a JSON array of video URLs, one per entry.<br />
                                Timestamp CSVs go in <code className="text-xs" style={{ color: 'var(--accent)' }}>server/data/timestamps/</code>
                            </p>
                        </>
                    )}
                    <button onClick={loadQueue} className="btn-primary px-5 py-2 text-sm inline-flex items-center gap-2 mx-auto">
                        <RefreshCw size={14} /> Reload
                    </button>
                </div>
            </div>
        );
    }

    const currentVideo = queue.videos[queue.currentIndex];
    const completedCount = queue.videos.filter(v => v.status === 'completed').length;
    const totalCount = queue.videos.length;

    return (
        <div className="h-full flex flex-col p-4 md:p-6 gap-5 overflow-y-auto scrollbar-thin">

            {/* Video progress header */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                <div className="flex items-center gap-3">
                    <Video size={16} style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Video {queue.currentIndex + 1} of {totalCount}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
                        {currentVideo?.name?.split('/').pop()}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--success)' }}>
                        {completedCount} completed
                    </span>
                    {currentVideo?.downloaded ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>local</span>
                    ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>streaming</span>
                    )}
                </div>
            </div>

            {/* Global progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--input-bg)' }}>
                <div className="h-full rounded-full transition-all duration-300" style={{
                    width: `${(completedCount / totalCount) * 100}%`,
                    background: 'var(--success)',
                }} />
            </div>

            {/* Video mini-nav */}
            <div className="flex flex-wrap gap-1.5">
                {queue.videos.map((v, idx) => (
                    <button key={idx} onClick={() => handleJumpToVideo(idx)}
                        className="w-8 h-8 rounded-md text-[10px] font-mono font-bold transition-all"
                        title={v.name}
                        style={{
                            background: idx === queue.currentIndex ? 'var(--accent)' : v.status === 'completed' ? 'var(--success)' : 'var(--input-bg)',
                            color: idx === queue.currentIndex || v.status === 'completed' ? 'white' : 'var(--text-muted)',
                            border: idx === queue.currentIndex ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                        }}>
                        {idx + 1}
                    </button>
                ))}
            </div>

            {/* Video Player */}
            <div className="glass-morphism rounded-2xl overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                <VideoPlayer
                    ref={videoRef}
                    videoUrl={currentVideo?.localUrl
                        ? `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${currentVideo.localUrl}`
                        : currentVideo?.url}
                    videoLabel={currentVideo?.name?.split('/').pop()}
                    onTimeUpdate={setCurrentTime}
                    onLoadedMetadata={setDuration}
                    selection={{ start: 0, end: 0 }}
                    onTimelineClick={() => {}}
                    activeAnnotation={null}
                />
            </div>

            {/* Segment reviewer (auto-loaded from timestamps DB) */}
            {segments && segments.length > 0 ? (
                <SegmentReviewer segments={segments} videoRef={videoRef} currentTime={currentTime} />
            ) : (
                <div className="glass-morphism rounded-xl p-6 text-center space-y-2">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        No timestamps found for this video.
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {queue?.timestampsSource === 'supabase' ? (
                            <>Add segments in Supabase <code style={{ color: 'var(--accent)' }}>timestamp_rows</code> (columns: <code style={{ color: 'var(--accent)' }}>video_name</code>, <code style={{ color: 'var(--accent)' }}>start</code>, <code style={{ color: 'var(--accent)' }}>end</code>) for video name <code style={{ color: 'var(--accent)' }}>{currentVideo?.name}</code>, or use the timestamp upload.</>
                        ) : (
                            <>Place the CSV at: <code style={{ color: 'var(--accent)' }}>server/data/timestamps/{currentVideo?.name}.csv</code></>
                        )}
                    </p>
                </div>
            )}

            {/* Complete & navigate */}
            <div className="flex items-center gap-3">
                <button onClick={handlePrevVideo} disabled={queue.currentIndex === 0}
                    className="btn-secondary text-sm px-4 py-2 disabled:opacity-30">
                    Prev Video
                </button>
                <div className="flex-1" />
                <button onClick={handleNextVideo}
                    className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2"
                    disabled={queue.currentIndex >= totalCount - 1}>
                    {queue.currentIndex >= totalCount - 1 ? (
                        <><Check size={16} /> All Done</>
                    ) : (
                        <><ChevronRight size={16} /> Complete &amp; Next Video</>
                    )}
                </button>
            </div>

            {/* Search and Filter */}
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search logs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input-field w-full pl-9 pr-8 text-sm h-9" />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
                    )}
                </div>
                <div className="relative">
                    <select value={filterIntent} onChange={e => setFilterIntent(e.target.value)} className="input-field text-sm h-9 pl-8 pr-3 appearance-none cursor-pointer min-w-[130px]">
                        <option value="">All Intents</option>
                        {INTENTS.map(i => <option key={i.value} value={i.value} style={{ background: 'var(--bg-surface)' }}>{i.label}</option>)}
                    </select>
                    <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                </div>
            </div>

            {/* Annotation Log Table */}
            <AnnotationLogTable />
        </div>
    );
};

export default Dashboard;
