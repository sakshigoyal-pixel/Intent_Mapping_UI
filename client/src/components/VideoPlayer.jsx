import { forwardRef, useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, Gauge } from 'lucide-react';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

const VideoPlayer = forwardRef(({ videoUrl, videoLabel, onTimeUpdate, onLoadedMetadata, selection, onTimelineClick, activeAnnotation }, ref) => {
    const [videoSrc, setVideoSrc] = useState(videoUrl || null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [localTime, setLocalTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showRateMenu, setShowRateMenu] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [videoError, setVideoError] = useState(false);

    const timelineRef = useRef(null);
    const volumeRef = useRef(null);

    useEffect(() => {
        if (videoUrl) {
            setVideoSrc(videoUrl);
            setIsPlaying(false);
            setProgress(0);
            setLocalTime(0);
            setVideoError(false);
        }
    }, [videoUrl]);

    const togglePlay = () => {
        const video = ref?.current;
        if (!video) return;
        if (video.paused) { video.play(); setIsPlaying(true); }
        else { video.pause(); setIsPlaying(false); }
    };

    const handleTimeUpdateInternal = () => {
        const video = ref?.current;
        if (!video || isDragging) return;
        const time = video.currentTime;
        setLocalTime(time);
        setProgress((time / video.duration) * 100);
        onTimeUpdate(time);
    };

    const handleMetadata = () => {
        const video = ref?.current;
        if (!video) return;
        setDuration(video.duration);
        onLoadedMetadata(video.duration);
    };

    const getTimeFromEvent = useCallback((e) => {
        const rect = timelineRef.current?.getBoundingClientRect();
        if (!rect || !duration) return 0;
        return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    }, [duration]);

    const handleTimelineMouseDown = (e) => {
        setIsDragging(true);
        seekTo(getTimeFromEvent(e));
        const handleMouseMove = (me) => seekTo(getTimeFromEvent(me));
        const handleMouseUp = (ue) => {
            setIsDragging(false);
            onTimelineClick(getTimeFromEvent(ue));
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const seekTo = (time) => {
        const video = ref?.current;
        if (!video) return;
        video.currentTime = time;
        setLocalTime(time);
        setProgress((time / duration) * 100);
        onTimeUpdate(time);
    };

    const handleVolumeChange = (e) => {
        const rect = volumeRef.current?.getBoundingClientRect();
        if (!rect) return;
        const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setVolume(vol);
        setIsMuted(vol === 0);
        if (ref?.current) ref.current.volume = vol;
    };

    const toggleMute = () => {
        const video = ref?.current;
        if (!video) return;
        if (isMuted) { video.volume = volume || 0.5; setIsMuted(false); if (volume === 0) setVolume(0.5); }
        else { video.volume = 0; setIsMuted(true); }
    };

    const applyPlaybackRate = (rate) => {
        setPlaybackRate(rate);
        if (ref?.current) ref.current.playbackRate = rate;
        setShowRateMenu(false);
    };

    const toggleFullscreen = () => {
        const video = ref?.current;
        if (!video) return;
        document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen?.();
    };

    if (!videoSrc) {
        return (
            <div className="aspect-video flex flex-col items-center justify-center m-3 rounded-xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No video loaded. Set up a video queue to begin.</p>
            </div>
        );
    }

    return (
        <div className="relative group/player">
            <video
                ref={ref}
                src={videoSrc}
                className="w-full aspect-video cursor-pointer bg-black"
                onTimeUpdate={handleTimeUpdateInternal}
                onLoadedMetadata={handleMetadata}
                onEnded={() => setIsPlaying(false)}
                onError={(e) => { console.error('Video load error:', e.target.error); setVideoError(true); }}
                onClick={togglePlay}
            />

            {videoError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <p className="text-red-400 text-sm">Failed to load video. Check the URL or network.</p>
                </div>
            )}

            {videoLabel && (
                <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 opacity-0 group-hover/player:opacity-100 transition-opacity"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', backdropFilter: 'blur(12px)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    {videoLabel}
                </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 opacity-0 group-hover/player:opacity-100 transition-opacity duration-300">
                <div ref={timelineRef} className="relative h-7 flex items-center mb-2 cursor-pointer group/timeline" onMouseDown={handleTimelineMouseDown}>
                    <div className="w-full h-1.5 group-hover/timeline:h-2.5 bg-white/15 rounded-full overflow-hidden relative transition-all">
                        {selection?.start > 0 && duration > 0 && (
                            <div className="absolute h-full rounded-full" style={{
                                background: 'rgba(99,102,241,0.35)', borderLeft: '2px solid rgba(99,102,241,0.7)', borderRight: '2px solid rgba(99,102,241,0.7)',
                                left: `${(selection.start / duration) * 100}%`, width: `${(((selection.end || localTime) - selection.start) / duration) * 100}%`
                            }} />
                        )}
                        {activeAnnotation && duration > 0 && (
                            <div className="absolute h-full rounded-full" style={{
                                background: 'rgba(34,197,94,0.35)', borderLeft: '2px solid rgba(34,197,94,0.7)', borderRight: '2px solid rgba(34,197,94,0.7)',
                                left: `${(activeAnnotation.startTime / duration) * 100}%`, width: `${((activeAnnotation.endTime - activeAnnotation.startTime) / duration) * 100}%`
                            }} />
                        )}
                        <div className="absolute h-full rounded-full transition-[width] duration-75" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
                    </div>
                    <div className="absolute w-3.5 h-3.5 rounded-full shadow-lg top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none border-2 scale-0 group-hover/timeline:scale-100 transition-transform"
                        style={{ left: `${progress}%`, background: 'white', borderColor: 'var(--accent)' }} />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={togglePlay} className="text-white hover:text-indigo-300 transition-colors p-1">
                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                        </button>
                        <button onClick={() => seekTo(0)} className="text-white/70 hover:text-white transition-colors p-1"><RotateCcw size={16} /></button>
                        <div className="flex items-center gap-2">
                            <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors p-1">
                                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                            </button>
                            <div ref={volumeRef} className="w-16 h-1 bg-white/20 rounded-full cursor-pointer relative" onClick={handleVolumeChange}>
                                <div className="h-full bg-white rounded-full" style={{ width: `${(isMuted ? 0 : volume) * 100}%` }} />
                            </div>
                        </div>
                        <span className="text-[11px] font-mono text-white/60 ml-1">{formatTime(localTime)} / {formatTime(duration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <button onClick={() => setShowRateMenu(p => !p)} className="text-[11px] font-mono text-white/60 hover:text-white transition-colors px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                                <Gauge size={12} />{playbackRate}x
                            </button>
                            {showRateMenu && (
                                <div className="absolute bottom-full mb-2 right-0 rounded-lg p-1 min-w-[80px] z-50" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                                    {PLAYBACK_RATES.map(rate => (
                                        <button key={rate} onClick={() => applyPlaybackRate(rate)} className="block w-full text-left px-3 py-1 text-xs rounded transition-colors"
                                            style={{ color: rate === playbackRate ? 'var(--accent)' : 'var(--text-secondary)', background: rate === playbackRate ? 'var(--accent-glow)' : 'transparent' }}>
                                            {rate}x
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={toggleFullscreen} className="text-white/60 hover:text-white transition-colors p-1"><Maximize2 size={16} /></button>
                    </div>
                </div>
            </div>
        </div>
    );
});

const formatTime = (time) => {
    if (isNaN(time)) return '00:00';
    const hrs = Math.floor(time / 3600);
    const mins = Math.floor((time % 3600) / 60);
    const secs = Math.floor(time % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

VideoPlayer.displayName = 'VideoPlayer';
export default VideoPlayer;
