import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { annotationService } from '../services/api';
import { toast } from 'react-toastify';

const AnnotationContext = createContext();

export const INTENTS = [
    { value: 'Able to See', label: 'Able to See', description: 'Patient can read or see the target clearly' },
    { value: 'Unable to See', label: 'Unable to See', description: 'Patient cannot read or see the target' },
    { value: 'Blurry', label: 'Blurry', description: 'Patient reports blurred or unclear vision' },
    { value: 'Not Sure', label: 'Not Sure', description: 'Patient is uncertain or hesitant about what they see' },
    { value: 'Flip 1', label: 'Flip 1', description: 'First lens flip comparison during refraction' },
    { value: 'Flip 2', label: 'Flip 2', description: 'Second lens flip comparison during refraction' },
    { value: 'Red', label: 'Red', description: 'Patient reports red is clearer (duochrome test)' },
    { value: 'Green', label: 'Green', description: 'Patient reports green is clearer (duochrome test)' },
    { value: 'Hesitation', label: 'Hesitation', description: 'Patient pauses or hesitates before responding' },
    { value: 'Both Same', label: 'Both Same', description: 'Patient reports both options look the same' },
    { value: 'Repeat', label: 'Repeat', description: 'Patient or doctor requests to repeat the test or question' },
];

export const AnnotationProvider = ({ children }) => {
    const [annotations, setAnnotations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIntent, setFilterIntent] = useState('');
    const [currentVideoId, setCurrentVideoId] = useState(null);

    const fetchAnnotations = useCallback(async () => {
        setLoading(true);
        try {
            const params = { sort: 'startTime' };
            if (currentVideoId) params.videoId = currentVideoId;
            const res = await annotationService.getAll(params);
            setAnnotations(res.data);
        } catch (error) {
            toast.error(error.message || 'Failed to fetch annotations');
        } finally {
            setLoading(false);
        }
    }, [currentVideoId]);

    const addAnnotation = async (annotation) => {
        try {
            const data = { ...annotation };
            if (currentVideoId) data.videoId = currentVideoId;
            const res = await annotationService.create(data);
            setAnnotations(prev => [...prev, res.data]);
            toast.success('Annotation saved');
            return res.data;
        } catch (error) {
            toast.error(error.message || 'Failed to add annotation');
            throw error;
        }
    };

    const updateAnnotation = async (id, updates) => {
        try {
            const res = await annotationService.update(id, updates);
            setAnnotations(prev => prev.map(a => a.id === id ? res.data : a));
        } catch (error) {
            toast.error(error.message || 'Failed to update annotation');
        }
    };

    const deleteAnnotation = async (id) => {
        try {
            await annotationService.remove(id);
            setAnnotations(prev => prev.filter(a => a.id !== id));
            toast.success('Annotation deleted');
        } catch (error) {
            toast.error(error.message || 'Failed to delete annotation');
        }
    };

    const filteredAnnotations = useMemo(() => {
        let result = annotations;
        if (filterIntent) result = result.filter(a => a.intent === filterIntent);
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(a =>
                (a.text || '').toLowerCase().includes(term) || a.intent.toLowerCase().includes(term)
            );
        }
        return result;
    }, [annotations, filterIntent, searchTerm]);

    useEffect(() => { fetchAnnotations(); }, [fetchAnnotations]);

    return (
        <AnnotationContext.Provider value={{
            annotations,
            filteredAnnotations,
            loading,
            searchTerm,
            setSearchTerm,
            filterIntent,
            setFilterIntent,
            currentVideoId,
            setCurrentVideoId,
            addAnnotation,
            updateAnnotation,
            deleteAnnotation,
            refresh: fetchAnnotations,
        }}>
            {children}
        </AnnotationContext.Provider>
    );
};

export const useAnnotations = () => {
    const context = useContext(AnnotationContext);
    if (!context) throw new Error('useAnnotations must be used within AnnotationProvider');
    return context;
};
