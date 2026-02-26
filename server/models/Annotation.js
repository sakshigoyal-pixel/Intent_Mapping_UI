const mongoose = require('mongoose');

const annotationSchema = new mongoose.Schema({
    videoId: { type: String, default: 'default' },
    startTime: { type: Number, required: true, min: 0 },
    endTime: { type: Number, required: true, min: 0 },
    intent: { type: String, required: true },
    text: { type: String, default: '' },
}, {
    timestamps: true,
    toJSON: {
        transform(doc, ret) {
            ret.id = ret._id.toString();
            delete ret._id;
            delete ret.__v;
        }
    }
});

module.exports = mongoose.model('Annotation', annotationSchema);
