import { useState } from 'react'
import Dashboard from './pages/Dashboard'

function App() {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col">
            <nav className="glass-morphism px-8 py-4 flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">V</div>
                    <h1 className="text-xl font-semibold tracking-tight">VideoAnnotate</h1>
                </div>
                <div className="flex gap-4">
                    {/* Navigation links could go here */}
                    <span className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded ring-1 ring-white/5">v1.0.0</span>
                </div>
            </nav>

            <main className="flex-1 overflow-hidden">
                <Dashboard />
            </main>

            <footer className="py-4 text-center text-slate-500 text-xs border-t border-white/5">
                &copy; 2026 Video Annotation Tool. All rights reserved.
            </footer>
        </div>
    )
}

export default App
