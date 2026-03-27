import { useState, useRef, useEffect, useCallback } from 'react';
import VideoPlayer from '../components/VideoPlayer';
import SegmentReviewer from '../components/SegmentReviewer';
import AnnotationLogTable from '../components/AnnotationLogTable';
import { useAnnotations, INTENTS } from '../context/AnnotationContext';
import { queueService, timestampService, API_ORIGIN } from '../services/api';
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
            if (!Array.isArray(videos) || videos.length === 0) {
                setLoadError('empty');
                setLoading(false);
                return;
            }
            let data = res.data;
            const incompleteIndexes = videos.map((v, i) => i).filter(i => !videos[i].fullyAnnotated);
            if (incompleteIndexes.length > 0 && videos[data.currentIndex]?.fullyAnnotated) {
                const forward = incompleteIndexes.find(i => i >= data.currentIndex);
                const target = forward !== undefined ? forward : incompleteIndexes[0];
                const setRes = await queueService.setCurrent(target);
                data = setRes.data;
            }
            setQueue(data);
            await activateVideo(data, data.currentIndex);
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
            const segs = res.data.segments || [];
            setSegments([...segs].sort((a, b) => (a.start ?? 0) - (b.start ?? 0)));
        } catch {
            setSegments(null);
        }
    }, [setCurrentVideoId]);

    const handleNextVideo = async () => {
        if (!queue) return;
        const idx = queue.currentIndex;
        try {
            let res = await queueService.complete(idx);
            let data = res.data;
            const newIncomplete = data.videos.map((v, i) => i).filter(i => !data.videos[i].fullyAnnotated);
            if (newIncomplete.length > 0 && data.videos[data.currentIndex]?.fullyAnnotated) {
                const forward = newIncomplete.find(i => i >= data.currentIndex);
                if (forward !== undefined) {
                    res = await queueService.setCurrent(forward);
                    data = res.data;
                }
            }
            setQueue(data);
            await activateVideo(data, data.currentIndex);
            setCurrentTime(0);
            setDuration(0);
            if (idx >= queue.videos.length - 1) {
                toast.success('Reached end of queue');
            }
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
                            Make sure the backend is running at <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-base)', color: 'var(--accent)' }}>{API_ORIGIN}</code> and try again.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                Go to Queue Setup, paste your video URLs (one per line), and click Load Videos.
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                You can also add video URLs to <code className="text-xs" style={{ color: 'var(--accent)' }}>server/data/videos.json</code> and set <code className="text-xs" style={{ color: 'var(--accent)' }}>SEED_QUEUE_FROM_VIDEOS_JSON=true</code> on the server if you prefer to seed from file.
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

    const incompleteIndexes = queue.videos.map((v, i) => i).filter(i => !queue.videos[i].fullyAnnotated);
    const incompleteCount = incompleteIndexes.length;
    const currentVideo = queue.videos[queue.currentIndex];
    const completedCount = queue.videos.filter(v => v.fullyAnnotated).length;
    const totalCount = queue.videos.length;
    const allDone = completedCount === totalCount;

    return (
        <div className="h-full flex flex-col p-4 md:p-6 gap-5 overflow-y-auto scrollbar-thin">

            {/* Video progress header */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                <div className="flex items-center gap-3">
                    <Video size={16} style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Video {queue.currentIndex + 1} of {totalCount}
                    </span>
                    {incompleteCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
                            {incompleteCount} left to annotate
                        </span>
                    )}
                    <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
                        {currentVideo?.name?.split('/').pop()}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--success)' }}>
                        {completedCount}/{totalCount} fully annotated
                    </span>
                    {currentVideo?.downloaded ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>local</span>
                    ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>streaming</span>
                    )}
                </div>
            </div>

            {/* Global progress bar (fully annotated ratio) */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--input-bg)' }}>
                <div className="h-full rounded-full transition-all duration-300" style={{
                    width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%`,
                    background: 'var(--success)',
                }} />
            </div>

            {/* Video mini-nav — every video in the queue (same as Edit Queue) */}
            <div className="flex flex-wrap gap-2 items-center">
                {queue.videos.map((v, idx) => {
                    const isCurrent = idx === queue.currentIndex;
                    const isDone = v.fullyAnnotated;
                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => handleJumpToVideo(idx)}
                            className="relative min-w-9 h-9 px-1 rounded-lg text-[10px] font-mono font-bold transition-all duration-150 flex items-center justify-center shrink-0"
                            title={`${idx + 1}. ${v.name}${isDone ? ' — fully annotated' : ''}`}
                            aria-current={isCurrent ? 'true' : undefined}
                            style={{
                                background: isCurrent
                                    ? 'var(--accent)'
                                    : isDone
                                        ? 'var(--success)'
                                        : 'var(--input-bg)',
                                color: isCurrent || isDone ? '#fff' : 'var(--text-muted)',
                                border: isCurrent ? '3px solid #fff' : '1px solid var(--border-default)',
                                boxShadow: isCurrent
                                    ? '0 0 0 2px var(--accent), 0 4px 14px rgba(0,0,0,0.45)'
                                    : 'none',
                                transform: isCurrent ? 'scale(1.08)' : 'scale(1)',
                                zIndex: isCurrent ? 2 : 1,
                            }}
                        >
                            {isDone ? <Check size={14} strokeWidth={2.5} /> : idx + 1}
                        </button>
                    );
                })}
            </div>

            {/* Video Player */}
            <div className="glass-morphism rounded-2xl overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                <VideoPlayer
                    ref={videoRef}
                    videoUrl={currentVideo?.localUrl
                        ? `${API_ORIGIN}${currentVideo.localUrl}`
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
                <button onClick={handlePrevVideo} disabled={queue.currentIndex <= 0}
                    className="btn-secondary text-sm px-4 py-2 disabled:opacity-30">
                    Prev Video
                </button>
                <div className="flex-1" />
                <button onClick={handleNextVideo}
                    className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2"
                    disabled={allDone}>
                    {allDone ? (
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
