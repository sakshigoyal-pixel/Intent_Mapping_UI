import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const message = error.response?.data?.error
            || error.response?.data?.errors?.join(', ')
            || error.message
            || 'An unexpected error occurred';
        return Promise.reject(new Error(message));
    }
);

export const annotationService = {
    getAll: (params = {}) => api.get('/annotations', { params }),
    getById: (id) => api.get(`/annotations/${id}`),
    create: (data) => api.post('/annotations', data),
    update: (id, data) => api.put(`/annotations/${id}`, data),
    remove: (id) => api.delete(`/annotations/${id}`),
};

export const queueService = {
    get: () => api.get('/queue'),
    set: (videos) => api.post('/queue', { videos }),
    setCurrent: (index) => api.put('/queue/current', { index }),
    complete: (index) => api.put(`/queue/${index}/complete`),
    clear: () => api.delete('/queue'),
};

export const timestampService = {
    list: () => api.get('/timestamps'),
    get: (videoName) => api.get(`/timestamps/${videoName}`),
    upload: (videoName, file) => {
        const form = new FormData();
        form.append('videoName', videoName);
        form.append('csv', file);
        return api.post('/timestamps/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    bulkUpload: (csvFiles) => api.post('/timestamps/bulk', { csvFiles }),
};

export default api;
