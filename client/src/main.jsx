import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AnnotationProvider } from './context/AnnotationContext'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <AnnotationProvider>
            <App />
            <ToastContainer position="bottom-right" theme="dark" />
        </AnnotationProvider>
    </React.StrictMode>,
)
