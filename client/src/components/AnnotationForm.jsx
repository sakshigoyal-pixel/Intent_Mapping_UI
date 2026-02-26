import { useState, useEffect } from 'react';
import { useAnnotations } from '../context/AnnotationContext';
import { Plus, X, ListFilter } from 'lucide-react';
import { motion } from 'framer-motion';

const AnnotationForm = ({ currentTime, selection, setSelection }) => {
    const { addAnnotation } = useAnnotations();
    const [formData, setFormData] = useState({
        intent: 'Greeting',
        text: '',
        startTime: 0,
        endTime: 0
    });

    const intents = ['Greeting', 'Symptom Inquiry', 'Diagnosis', 'Advice', 'Other'];

    useEffect(() => {
        if (selection.start > 0) {
            setFormData(prev => ({
                ...prev,
                startTime: parseFloat(selection.start.toFixed(2)),
                endTime: selection.end > 0 ? parseFloat(selection.end.toFixed(2)) : parseFloat(currentTime.toFixed(2))
            }));
        }
    }, [selection, currentTime]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.text) return;

        await addAnnotation({
            ...formData,
            startTime: parseFloat(formData.startTime),
            endTime: parseFloat(formData.endTime)
        });

        // Reset
        setFormData(prev => ({ ...prev, text: '' }));
        setSelection({ start: 0, end: 0 });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Start Time (sec)</label>
                    <input
                        type="number"
                        step="0.01"
                        name="startTime"
                        value={formData.startTime}
                        onChange={handleChange}
                        className="input-field w-full"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">End Time (sec)</label>
                    <input
                        type="number"
                        step="0.01"
                        name="endTime"
                        value={formData.endTime}
                        onChange={handleChange}
                        className="input-field w-full"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <ListFilter size={14} />
                    Classification / Intent
                </label>
                <select
                    name="intent"
                    value={formData.intent}
                    onChange={handleChange}
                    className="input-field w-full appearance-none cursor-pointer"
                >
                    {intents.map(i => <option key={i} value={i} className="bg-slate-900">{i}</option>)}
                </select>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Conversation Text</label>
                <textarea
                    name="text"
                    value={formData.text}
                    onChange={handleChange}
                    placeholder="Enter what was said..."
                    className="input-field w-full h-24 resize-none"
                    required
                />
            </div>

            <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <Plus size={18} />
                    Add Annotation
                </button>
                <button
                    type="button"
                    onClick={() => setSelection({ start: 0, end: 0 })}
                    className="btn-secondary px-3"
                    title="Clear Selection"
                >
                    <X size={18} />
                </button>
            </div>
        </form>
    );
};

export default AnnotationForm;
