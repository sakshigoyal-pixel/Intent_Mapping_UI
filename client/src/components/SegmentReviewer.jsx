import { useState, useEffect, useRef, useCallback } from 'react';
import { useAnnotations, INTENTS } from '../context/AnnotationContext';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Save, Check } from 'lucide-react';
import { secondsToMMSS } from '../utils/time';
import { toast } from 'react-toastify';

const SegmentReviewer = ({ segments, videoRef, currentTime }) => {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [localAnnotations, setLocalAnnotations] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const { addAnnotation, updateAnnotation, annotations } = useAnnotations();

    const segment = segments[currentIdx];
    const total = segments.length;

    useEffect(() => {
        setLocalAnnotations(
            segments.map((seg, i) => {
                const existing = annotations.find(
                    a => Math.abs(a.startTime - seg.start) < 0.5 && Math.abs(a.endTime - seg.end) < 0.5
                );
                return {
                    segIdx: i,
                    id: existing?.id || null,
                    intent: existing?.intent || '',
                    text: existing?.text || '',
                    saved: !!existing,
                };
            })
        );
    }, [segments, annotations]);

    const seekToSegment = useCallback((idx) => {
        const video = videoRef?.current;
        if (!video || !segments[idx]) return;
        video.pause();
        video.currentTime = segments[idx].start;
        setIsPlaying(false);
    }, [videoRef, segments]);

    useEffect(() => {
        seekToSegment(currentIdx);
    }, [currentIdx, seekToSegment]);

    // Precise auto-pause at segment end using direct video listener
    useEffect(() => {
        const video = videoRef?.current;
        if (!video || !segment) return;

        const onTime = () => {
            if (video.currentTime >= segment.end) {
                video.pause();
                video.currentTime = segment.end;
                setIsPlaying(false);
            }
        };

        video.addEventListener('timeupdate', onTime);
        return () => video.removeEventListener('timeupdate', onTime);
    }, [segment, videoRef]);

    const goToIdx = (idx) => {
        if (idx >= 0 && idx < total) setCurrentIdx(idx);
    };

    const togglePlaySegment = () => {
        const video = videoRef?.current;
        if (!video || !segment) return;
        if (isPlaying) {
            video.pause();
            setIsPlaying(false);
        } else {
            if (video.currentTime >= segment.end - 0.1 || video.currentTime < segment.start) {
                video.currentTime = segment.start;
            }
            video.play();
            setIsPlaying(true);
        }
    };

    const replaySegment = () => {
        const video = videoRef?.current;
        if (!video || !segment) return;
        video.currentTime = segment.start;
        video.play();
        setIsPlaying(true);
    };

    const local = localAnnotations[currentIdx] || { intent: '', text: '', saved: false, id: null };

    const updateLocal = (field, value) => {
        setLocalAnnotations(prev => {
            const copy = [...prev];
            copy[currentIdx] = { ...copy[currentIdx], [field]: value, saved: false };
            return copy;
        });
    };

    const saveCurrentAnnotation = async () => {
        if (!local.intent) {
            toast.warn('Please select an intent before saving');
            return;
        }
        const data = {
            startTime: segment.start,
            endTime: segment.end,
            intent: local.intent,
            text: local.text || '',
        };
        try {
            if (local.id) {
                await updateAnnotation(local.id, data);
            } else {
                const result = await addAnnotation(data);
                setLocalAnnotations(prev => {
                    const copy = [...prev];
                    copy[currentIdx] = { ...copy[currentIdx], id: result.id, saved: true };
                    return copy;
                });
                return;
            }
            setLocalAnnotations(prev => {
                const copy = [...prev];
                copy[currentIdx] = { ...copy[currentIdx], saved: true };
                return copy;
            });
        } catch { /* toast handles error */ }
    };

    const saveAndNext = async () => {
        await saveCurrentAnnotation();
        if (currentIdx < total - 1) goToIdx(currentIdx + 1);
    };

    const progress = segment
        ? Math.max(0, Math.min(100, ((currentTime - segment.start) / (segment.end - segment.start)) * 100))
        : 0;

    if (!segment) return null;

    return (
        <div className="space-y-4">
            {/* Navigation bar */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                <button onClick={() => goToIdx(currentIdx - 1)} disabled={currentIdx === 0} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-30" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                    <ChevronLeft size={16} /> Prev
                </button>

                <div className="flex items-center gap-3">
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        Segment {currentIdx + 1} of {total}
                    </span>
                    <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--bg-base)', color: 'var(--accent)', border: '1px solid var(--border-default)' }}>
                        {secondsToMMSS(segment.start)} - {secondsToMMSS(segment.end)}
                    </span>
                </div>

                <button onClick={() => goToIdx(currentIdx + 1)} disabled={currentIdx === total - 1} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-30" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                    Next <ChevronRight size={16} />
                </button>
            </div>

            {/* Segment progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--input-bg)' }}>
                <div className="h-full rounded-full transition-all duration-100" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-3">
                <button onClick={togglePlaySegment} className="btn-primary px-4 py-2 flex items-center gap-2 text-sm">
                    {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    {isPlaying ? 'Pause' : 'Play Segment'}
                </button>
                <button onClick={replaySegment} className="btn-secondary px-3 py-2 flex items-center gap-2 text-sm">
                    <RotateCcw size={14} /> Replay
                </button>
                <span className="text-xs font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>
                    {secondsToMMSS(currentTime)} / {secondsToMMSS(segment.end)}
                </span>
            </div>

            {/* Annotation form */}
            <div className="glass-morphism rounded-xl p-5 space-y-4">
                {/* Timestamps (read-only) */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Start Time</label>
                        <div className="input-field font-mono text-sm py-2 text-center" style={{ opacity: 0.7 }}>
                            {secondsToMMSS(segment.start)}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>End Time</label>
                        <div className="input-field font-mono text-sm py-2 text-center" style={{ opacity: 0.7 }}>
                            {secondsToMMSS(segment.end)}
                        </div>
                    </div>
                </div>

                {/* Intent dropdown */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Intent</label>
                    <select
                        value={local.intent}
                        onChange={(e) => updateLocal('intent', e.target.value)}
                        className="input-field w-full text-sm py-2.5 cursor-pointer appearance-none"
                    >
                        <option value="" style={{ background: 'var(--bg-surface)' }}>-- Select Intent --</option>
                        {INTENTS.map(i => (
                            <option key={i.value} value={i.value} style={{ background: 'var(--bg-surface)' }}>
                                {i.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Translation text */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Translation Text</label>
                    <textarea
                        value={local.text}
                        onChange={(e) => updateLocal('text', e.target.value)}
                        placeholder="Type what was said in this segment..."
                        className="input-field w-full h-20 resize-none text-sm"
                    />
                </div>

                {/* Save buttons */}
                <div className="flex gap-3">
                    <button onClick={saveCurrentAnnotation} className="btn-secondary text-sm flex items-center gap-2 px-4 py-2">
                        <Save size={14} /> Save
                    </button>
                    <button onClick={saveAndNext} className="btn-primary text-sm flex-1 flex items-center justify-center gap-2 py-2">
                        {local.saved ? <Check size={14} /> : <Save size={14} />}
                        {currentIdx < total - 1 ? 'Save & Next' : 'Save (Last)'}
                    </button>
                </div>

                {local.saved && (
                    <div className="text-xs flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                        <Check size={12} /> Saved: {secondsToMMSS(segment.start)} - {secondsToMMSS(segment.end)} | {local.intent} | {local.text || '(no text)'}
                    </div>
                )}
            </div>

            {/* Segment list overview */}
            <div className="flex flex-wrap gap-1.5">
                {segments.map((seg, idx) => {
                    const la = localAnnotations[idx];
                    const isCurrent = idx === currentIdx;
                    const isSaved = la?.saved;
                    return (
                        <button key={idx} onClick={() => goToIdx(idx)}
                            className="w-8 h-8 rounded-md text-[10px] font-mono font-bold transition-all"
                            style={{
                                background: isCurrent ? 'var(--accent)' : isSaved ? 'var(--success)' : 'var(--input-bg)',
                                color: isCurrent || isSaved ? 'white' : 'var(--text-muted)',
                                border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                            }}
                            title={`${secondsToMMSS(seg.start)} - ${secondsToMMSS(seg.end)}`}>
                            {idx + 1}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default SegmentReviewer;
