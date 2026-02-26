import { Trash2, Edit3, MessageCircle, Clock } from 'lucide-react';
import { useAnnotations } from '../context/AnnotationContext';
import { motion, AnimatePresence } from 'framer-motion';

const AnnotationTable = ({ onSelect, selectedId }) => {
    const { annotations, deleteAnnotation } = useAnnotations();

    if (annotations.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-slate-500">
                <MessageCircle size={48} className="mb-4 opacity-20" />
                <p>No annotations yet.</p>
                <p className="text-xs">Start by selecting a range on the video player.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide p-4 space-y-3">
            <AnimatePresence mode='popLayout'>
                {annotations.map((ann) => (
                    <motion.div
                        key={ann.id}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        whileHover={{ scale: 1.01 }}
                        onClick={() => onSelect(ann.id)}
                        className={`group relative p-4 rounded-xl cursor-pointer transition-all border ${selectedId === ann.id
                                ? 'bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/5'
                                : 'bg-white/5 border-white/5 hover:border-white/10'
                            }`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded ${getIntentColor(ann.intent)
                                }`}>
                                {ann.intent}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteAnnotation(ann.id); }}
                                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        <p className="text-sm text-slate-200 line-clamp-2 mb-3 leading-relaxed">
                            "{ann.text}"
                        </p>

                        <div className="flex items-center gap-3 text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                                <Clock size={12} />
                                <span>{ann.startTime}s - {ann.endTime}s</span>
                            </div>
                            <span className="w-1 h-1 bg-slate-700 rounded-full" />
                            <span>{Math.round(ann.endTime - ann.startTime)}s duration</span>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

const getIntentColor = (intent) => {
    switch (intent) {
        case 'Greeting': return 'bg-emerald-500/20 text-emerald-400';
        case 'Symptom Inquiry': return 'bg-amber-500/20 text-amber-400';
        case 'Diagnosis': return 'bg-purple-500/20 text-purple-400';
        case 'Advice': return 'bg-blue-500/20 text-blue-400';
        default: return 'bg-slate-500/20 text-slate-400';
    }
};

export default AnnotationTable;
