import { useState } from 'react';
import { useAnnotations, INTENTS } from '../context/AnnotationContext';
import { Trash2, Download, FileJson } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { secondsToMMSS } from '../utils/time';

const AnnotationLogTable = () => {
    const { annotations, filteredAnnotations, updateAnnotation, deleteAnnotation } = useAnnotations();
    const [editingCell, setEditingCell] = useState(null);
    const [editValue, setEditValue] = useState('');

    const startEdit = (id, field, value) => { setEditingCell({ id, field }); setEditValue(value); };

    const saveEdit = async (id, field) => {
        if (editValue !== undefined) await updateAnnotation(id, { [field]: editValue });
        setEditingCell(null);
        setEditValue('');
    };

    const handleKeyDown = (e, id, field) => {
        if (e.key === 'Enter') saveEdit(id, field);
        if (e.key === 'Escape') setEditingCell(null);
    };

    const exportJSON = () => {
        const blob = new Blob([JSON.stringify(annotations, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'annotation_logs.json'; a.click();
        URL.revokeObjectURL(url);
    };

    const exportCSV = () => {
        const header = 'Start Time,End Time,Intent,Translation Text\n';
        const rows = annotations.map(a => {
            const t = (a.text || '').replace(/"/g, '""');
            return [secondsToMMSS(a.startTime), secondsToMMSS(a.endTime), a.intent, t].map(v => '"' + v + '"').join(',');
        }).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'annotation_logs.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const thStyle = { color: 'var(--text-muted)' };

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Annotation Logs</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                        {filteredAnnotations.length}
                    </span>
                </div>
                <div className="flex gap-2">
                    <button onClick={exportCSV} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"><Download size={13} /> CSV</button>
                    <button onClick={exportJSON} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"><FileJson size={13} /> JSON</button>
                </div>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
                                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ ...thStyle, width: 50 }}>#</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ ...thStyle, width: 110 }}>Start Time</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ ...thStyle, width: 110 }}>End Time</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ ...thStyle, width: 160 }}>Intent</th>
                                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={thStyle}>Translation Text</th>
                                <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest" style={{ ...thStyle, width: 70 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {filteredAnnotations.length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No annotations yet. Use the Start / End buttons above to begin.</td></tr>
                                ) : filteredAnnotations.map((ann, idx) => (
                                    <motion.tr key={ann.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="group"
                                        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-bg)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; }}>
                                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                                        <td className="px-4 py-3 font-mono text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{secondsToMMSS(ann.startTime)}</td>
                                        <td className="px-4 py-3 font-mono text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{secondsToMMSS(ann.endTime)}</td>
                                        <td className="px-4 py-2">
                                            <select value={ann.intent} onChange={e => updateAnnotation(ann.id, { intent: e.target.value })} className="input-field text-xs py-1.5 px-2 w-full cursor-pointer" style={{ minWidth: 120 }}>
                                                {INTENTS.map(i => <option key={i.value} value={i.value} style={{ background: 'var(--bg-surface)' }}>{i.label}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2">
                                            {editingCell?.id === ann.id && editingCell?.field === 'text' ? (
                                                <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(ann.id, 'text')} onKeyDown={e => handleKeyDown(e, ann.id, 'text')} className="input-field text-xs py-1.5 px-2 w-full" autoFocus />
                                            ) : (
                                                <div onClick={() => startEdit(ann.id, 'text', ann.text)} className="text-xs py-1.5 px-2 rounded cursor-text min-h-[32px] flex items-center" style={{ color: ann.text ? 'var(--text-primary)' : 'var(--text-muted)' }} title="Click to edit">
                                                    {ann.text || 'Click to add text...'}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => deleteAnnotation(ann.id)} className="p-1.5 rounded-md transition-all opacity-40 group-hover:opacity-100 hover:text-rose-400" style={{ color: 'var(--text-muted)' }} title="Delete row"><Trash2 size={14} /></button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AnnotationLogTable;
