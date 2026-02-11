
import React, { useState, useRef, useCallback, FC, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { analyzeScriptWithAI } from './services/geminiService';

// --- TYPES & CONSTANTS ---
export interface ImageFile {
  name: string;
  dataUrl: string;
  base64: string;
  mimeType: string;
}

interface ScenePrompt {
  id: number;
  phase: string;
  imagePrompt?: string;
  videoPrompt?: string;
  scriptLine: string;
}

export interface ApiKey {
    id: string;
    provider: 'Google' | 'OpenAI';
    key: string;
    name: string;
    isActive: boolean;
}

export interface SavedSession {
    id: string;
    name: string; // Script filename or custom name
    timestamp: number;
    prompts: ScenePrompt[];
}

// Thay đổi mode: Chỉ còn general
type AppMode = 'general';
type PromptType = 'image' | 'video';

// Models
const MODELS = [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Tư duy phức tạp)', recommended: false },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Nhanh & Tiết kiệm)', recommended: true },
];

// Toast Types
type ToastType = 'success' | 'error' | 'info';
interface ToastMessage {
    id: string;
    type: ToastType;
    title: string;
    message: string;
}

// Style Presets (Translated to Vietnamese Labels)
const PRESET_STYLES = [
    { id: 'cinematic', label: '🎬 Điện ảnh thực tế (Cinematic)', prompt: 'Cinematic style, 8k resolution, highly detailed, professional composition, atmospheric lighting, sharp focus, photorealistic, raw style.' },
    { id: 'anime', label: '🌸 Anime (Ghibli)', prompt: 'Anime style, Studio Ghibli inspired, vibrant colors, lush backgrounds, expressive characters, hand-drawn animation feel, detailed aesthetic.' },
    { id: '3d_pixar', label: '🧸 Hoạt hình 3D (Pixar)', prompt: '3D Disney/Pixar style, cute characters, soft lighting, 3d render, high fidelity, octane render, smooth textures, expressive eyes.' },
    { id: 'stick_figure', label: '🖍️ Người que (Stick Figure)', prompt: 'Stick figure style, simple line drawing, white background, childish and funny, minimal details, hand-drawn marker look.' },
    { id: 'oil_painting', label: '🎨 Tranh sơn dầu', prompt: 'Oil painting style, textured brushstrokes, artistic, classic masterpiece vibe, rich colors, heavy impasto, traditional art.' },
    { id: 'watercolor', label: '💧 Màu nước', prompt: 'Watercolor painting style, soft edges, pastel colors, artistic and dreamy, wet-on-wet technique, paper texture.' },
    { id: 'cyberpunk', label: '🌃 Cyberpunk (Tương lai)', prompt: 'Cyberpunk style, neon lights, futuristic city, high tech low life, vibrant purple and blue tones, rain-slicked streets, holographic details.' },
    { id: 'vintage_1950', label: '📺 Cổ điển 1950s', prompt: 'Vintage 1950s photo style, film grain, sepia or faded technicolor, retro fashion, old-school photography aesthetics, nostalgia.' },
    { id: 'noir', label: '🕵️ Phim Noir (Trắng đen)', prompt: 'Film Noir style, black and white, high contrast, dramatic shadows, dutch angles, mystery, silhouette, classic cinema.' },
    { id: 'pixel_art', label: '👾 Pixel Art (8-Bit)', prompt: '8-bit Pixel Art, retro game style, blocky, vibrant colors, nostalgic gaming aesthetic, clean sprites.' },
    { id: 'claymation', label: '🧱 Đất sét (Claymation)', prompt: 'Claymation style, plasticine texture, stop motion look, Aardman inspired, fingerprint details on clay, handmade feel.' },
    { id: 'comic_book', label: '💬 Truyện tranh (Comic)', prompt: 'Comic book style, bold outlines, halftone patterns, vibrant colors, action lines, graphic novel aesthetic.' },
    { id: 'fantasy_art', label: '🐉 Giả tưởng Epic (Fantasy)', prompt: 'Fantasy art style, Dungeons & Dragons style, magical atmosphere, glowing effects, epic composition, highly detailed armor and environments.' },
    { id: 'horror', label: '🧟 Kinh dị (Horror)', prompt: 'Horror style, dark atmosphere, mist, eerie lighting, scary vibes, muted colors, cinematic thriller look.' },
    { id: 'pencil_sketch', label: '✏️ Phác thảo chì', prompt: 'Pencil sketch style, charcoal, rough lines, artistic shading, monochrome, sketchbook aesthetic.' },
    { id: 'low_poly', label: '🔷 Low Poly (3D khối)', prompt: 'Low Poly 3D style, geometric shapes, flat shading, minimalist, vibrant colors, game art aesthetic.' },
    { id: 'steampunk', label: '⚙️ Steampunk (Hơi nước)', prompt: 'Steampunk style, brass and copper tones, gears and clockwork, victorian sci-fi, steam power, industrial aesthetic.' },
    { id: 'origami', label: '📄 Gấp giấy (Origami)', prompt: 'Paper cut-out style, origami, layered paper texture, depth of field, craft art, soft shadows.' },
    { id: 'ukiyo_e', label: '🌊 Tranh khắc gỗ Nhật (Ukiyo-e)', prompt: 'Japanese Ukiyo-e woodblock print style, traditional patterns, flat perspective, sweeping lines, Hokusai inspired.' },
    { id: 'abstract', label: '🌀 Trừu tượng siêu thực', prompt: 'Abstract surrealism, dreamlike, weird shapes, vibrant and contrasting colors, dali-esque, melting reality.' },
];

// Giới hạn ảnh tham chiếu tối đa là 3
const MAX_REFERENCE_IMAGES = 3;

// --- UTILITY FUNCTIONS ---
const fileToDataUrl = (file: File): Promise<{ dataUrl: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

const getTimestamp = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${h}${m}${s}`;
};

const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('vi-VN');
};

const exportToExcel = (prompts: ScenePrompt[], filenamePrefix: string = 'storyboard') => {
      if (prompts.length === 0) return;
      
      const wsData = prompts.map((p, index) => ({
          'Cảnh': index + 1,
          'Nội dung Script': p.scriptLine,
          // Conditionally add prompt based on existence
          ...(p.imagePrompt ? { 'Prompt Hình ảnh': p.imagePrompt } : {}),
          ...(p.videoPrompt ? { 'Prompt Video': p.videoPrompt } : {})
      }));
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(wsData);
      
      const wscols = Object.keys(wsData[0]).map(k => ({ wch: 30 }));
      ws['!cols'] = wscols;
      
      XLSX.utils.book_append_sheet(wb, ws, "Storyboard");
      XLSX.writeFile(wb, `${filenamePrefix}_${getTimestamp()}.xlsx`);
};

// --- UI ICONS ---
const UploadIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
  </svg>
);

const DocumentIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
);

const TextDocumentIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0h5.625M12 10.5h.008v.008H12V10.5Zm0 4.5h.008v.008H12V15Zm0 4.5h.008v.008H12v-.008ZM9.75 6.75h.75a.75.75 0 0 1 .75.75v11.25a.75.75 0 0 1-.75.75h-.75a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 .75-.75Zm0 0h12.375m-9.375 12h8.625" />
    </svg>
);

const DownloadIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const WarningIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
);

const CheckCircleIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const InformationCircleIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
  </svg>
);

const XMarkIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

const ArrowPathIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const SpinnerIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const KeyIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
);

const TrashIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.124-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.077-2.09.921-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
);

const ClockIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

const SparklesIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423Z" />
  </svg>
);

const LibraryIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
    </svg>
);

const BookOpenIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
  </svg>
);

const VideoCameraIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
);

const PhotoIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

const ChevronDownIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);

const ChevronUpIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
  </svg>
);

// --- CHILD COMPONENTS ---

// TOAST COMPONENTS
const ToastItem: FC<{ toast: ToastMessage; onClose: (id: string) => void }> = ({ toast, onClose }) => {
    const bgClass = toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500' 
                  : toast.type === 'error' ? 'bg-red-900/90 border-red-500' 
                  : 'bg-indigo-900/90 border-indigo-500';
    const iconColor = toast.type === 'success' ? 'text-emerald-400' 
                    : toast.type === 'error' ? 'text-red-400' 
                    : 'text-indigo-400';
                    
    return (
        <div className={`${bgClass} border-l-4 p-4 rounded-r shadow-2xl mb-3 flex items-start gap-3 min-w-[320px] max-w-md animate-fade-in relative backdrop-blur-md transition-all duration-300 transform hover:translate-x-1`}>
            <div className={`mt-0.5 ${iconColor}`}>
                {toast.type === 'success' && <CheckCircleIcon className="h-6 w-6" />}
                {toast.type === 'error' && <WarningIcon className="h-6 w-6" />} 
                {toast.type === 'info' && <InformationCircleIcon className="h-6 w-6" />}
            </div>
            <div className="flex-1">
                <h4 className={`text-sm font-bold ${iconColor} mb-1 uppercase tracking-wider`}>{toast.title}</h4>
                <p className="text-xs text-slate-100 leading-relaxed font-medium">{toast.message}</p>
            </div>
            <button onClick={() => onClose(toast.id)} className="text-slate-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                <XMarkIcon className="h-4 w-4" />
            </button>
        </div>
    );
};

const ToastContainer: FC<{ toasts: ToastMessage[]; onClose: (id: string) => void }> = ({ toasts, onClose }) => {
    return (
        <div className="fixed top-20 right-4 z-50 flex flex-col items-end pointer-events-none">
            <div className="pointer-events-auto">
                {toasts.map(toast => (
                    <ToastItem key={toast.id} toast={toast} onClose={onClose} />
                ))}
            </div>
        </div>
    );
};

const WelcomeGuide: FC = () => (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 backdrop-blur-sm shadow-xl animate-fade-in min-h-[50vh] flex flex-col justify-center">
        <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-lg shadow-lg">👋</span>
            Vui lòng đọc kỹ hướng dẫn và nhập API để bắt đầu
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">1</div>
                <h3 className="font-bold text-slate-200 mb-2">Cấu hình API Key</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                   Bấm nút <strong>API</strong> góc trên bên phải để nhập Key. Tool mặc định chọn Gemini 3 Flash, nhưng bạn có thể chuyển sang Gemini 3 Pro nếu API key của bạn có. Lấy API Key miễn phí tại: <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline font-bold">Google AI Studio</a>.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">2</div>
                <h3 className="font-bold text-slate-200 mb-2">Nhập liệu</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Upload script (.txt, .srt) hoặc dán văn bản. Tải lên <strong>Ảnh tham chiếu</strong> để AI nhúng phong cách vào prompt.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">3</div>
                <h3 className="font-bold text-slate-200 mb-2">Phân tích & Tạo Prompt</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Nhấn <strong>Tạo Storyboard Pro</strong>. AI sẽ phân tách script thành các phân cảnh và tạo prompt hình ảnh/video chi tiết.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">4</div>
                <h3 className="font-bold text-slate-200 mb-2">Xuất kết quả</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Tải file <strong>Excel</strong> chứa toàn bộ prompt để sử dụng cho các công cụ tạo ảnh/video chuyên dụng khác. Tải file <strong>TXT</strong> để đồng bộ.
                </p>
            </div>

             <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">5</div>
                <h3 className="font-bold text-slate-200 mb-2">Tạo ảnh hàng loạt</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Sử dụng tool <a href="https://github.com/duckmartians/G-Labs-Automation/releases/tag/v1.2.6" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">G-lab-Automation</a> hoặc <a href="https://chromewebstore.google.com/detail/auto-whisk-automator-for/gedfnhdibkfgacmkbjgpfjihacalnlpn" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Auto Whisk Automator</a> với file Excel (bước 4) để tự động tạo ảnh từ prompt. <br/>Hoặc các bạn có thể sử dụng bất kỳ tool tạo ảnh nào đang dùng.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">6</div>
                <h3 className="font-bold text-slate-200 mb-2">Chuẩn bị tài nguyên</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Gom tất cả vào 1 thư mục: File script (.txt từ bước 4), toàn bộ ảnh đã tạo, và file Audio giọng đọc (từ 11Labs/Minimax/...).
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">7</div>
                <h3 className="font-bold text-slate-200 mb-2">Đồng bộ Audio & Hình ảnh</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Mở tool <strong>AudioScriptImageSync</strong>. Tại ô "Upload All", chọn toàn bộ file trong thư mục bước 6. Nhấn <strong>Analyze & Sync</strong>.
                </p>
            </div>

            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">8</div>
                <h3 className="font-bold text-slate-200 mb-2">Xuất Video</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                    Sau khi Sync xong, nhấn <strong>Create MP4</strong>. Chờ xử lý rồi nhấn <strong>Download</strong> để tải video hoàn thiện.
                </p>
            </div>
        </div>
    </div>
);

// --- MODALS ---
const ApiSettingsModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    apiKey: string;
    setApiKey: (key: string) => void;
    selectedModel: string;
    setSelectedModel: (model: string) => void;
}> = ({ isOpen, onClose, apiKey, setApiKey, selectedModel, setSelectedModel }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                    <XMarkIcon className="h-6 w-6" />
                </button>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <KeyIcon className="h-6 w-6 text-emerald-400" />
                    Cài đặt API & Model
                </h3>
                
                <div className="space-y-6">
                     <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Gemini API Key</label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Nhập API Key của bạn"
                            className="w-full bg-slate-800 border border-slate-700 p-3 rounded-md focus:ring-2 focus:ring-emerald-500 text-white text-sm"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            Lấy key miễn phí tại <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google AI Studio</a>.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Chọn Model</label>
                        <div className="space-y-2">
                            {MODELS.map(model => (
                                <button
                                    key={model.id}
                                    onClick={() => setSelectedModel(model.id)}
                                    className={`w-full p-3 rounded-lg border text-left transition-all ${selectedModel === model.id ? 'bg-emerald-900/30 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'}`}
                                >
                                    <div className="font-bold text-sm">{model.name}</div>
                                    {model.recommended && <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 mt-1">Khuyên dùng</div>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end">
                    <button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors">
                        Hoàn tất
                    </button>
                </div>
            </div>
        </div>
    );
};

const GuideModal: FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                    <XMarkIcon className="h-6 w-6" />
                </button>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <BookOpenIcon className="h-6 w-6 text-emerald-400" />
                    Hướng dẫn sử dụng
                </h3>
                
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar p-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Step 1 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">1</div>
                            <h3 className="font-bold text-slate-200 mb-2">Cấu hình API Key</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                            Bấm nút <strong>API</strong> góc trên bên phải để nhập Key. Tool mặc định chọn Gemini 3 Flash, nhưng bạn có thể chuyển sang Gemini 3 Pro nếu API key của bạn có. Lấy API Key miễn phí tại: <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline font-bold">Google AI Studio</a>.
                            </p>
                        </div>

                        {/* Step 2 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">2</div>
                            <h3 className="font-bold text-slate-200 mb-2">Nhập liệu</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Upload script (.txt, .srt) hoặc dán văn bản. Tải lên <strong>Ảnh tham chiếu</strong> để AI nhúng phong cách vào prompt.
                            </p>
                        </div>

                        {/* Step 3 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">3</div>
                            <h3 className="font-bold text-slate-200 mb-2">Phân tích & Tạo Prompt</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Nhấn <strong>Tạo Storyboard Pro</strong>. AI sẽ phân tách script thành các phân cảnh và tạo prompt hình ảnh/video chi tiết.
                            </p>
                        </div>

                        {/* Step 4 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">4</div>
                            <h3 className="font-bold text-slate-200 mb-2">Xuất kết quả</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Tải file <strong>Excel</strong> chứa toàn bộ prompt để sử dụng cho các công cụ tạo ảnh/video chuyên dụng khác. Tải file <strong>TXT</strong> để đồng bộ.
                            </p>
                        </div>

                        {/* Step 5 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">5</div>
                            <h3 className="font-bold text-slate-200 mb-2">Tạo ảnh hàng loạt</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Sử dụng tool <a href="https://github.com/duckmartians/G-Labs-Automation/releases/tag/v1.2.6" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">G-lab-Automation</a> hoặc <a href="https://chromewebstore.google.com/detail/auto-whisk-automator-for/gedfnhdibkfgacmkbjgpfjihacalnlpn" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Auto Whisk Automator</a> với file Excel (bước 4) để tự động tạo ảnh từ prompt. <br/>Hoặc các bạn có thể sử dụng bất kỳ tool tạo ảnh nào đang dùng.
                            </p>
                        </div>

                        {/* Step 6 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">6</div>
                            <h3 className="font-bold text-slate-200 mb-2">Chuẩn bị tài nguyên</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Gom tất cả vào 1 thư mục: File script (.txt từ bước 4), toàn bộ ảnh đã tạo, và file Audio giọng đọc (từ 11Labs/Minimax/...).
                            </p>
                        </div>

                        {/* Step 7 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">7</div>
                            <h3 className="font-bold text-slate-200 mb-2">Đồng bộ Audio & Hình ảnh</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Mở tool <strong>AudioScriptImageSync</strong>. Tại ô "Upload All", chọn toàn bộ file trong thư mục bước 6. Nhấn <strong>Analyze & Sync</strong>.
                            </p>
                        </div>

                        {/* Step 8 */}
                        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold mb-3 border border-emerald-500/30">8</div>
                            <h3 className="font-bold text-slate-200 mb-2">Xuất Video</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Sau khi Sync xong, nhấn <strong>Create MP4</strong>. Chờ xử lý rồi nhấn <strong>Download</strong> để tải video hoàn thiện.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const LibraryModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    sessions: SavedSession[];
    onDelete: (id: string) => void;
    onDownload: (session: SavedSession) => void;
}> = ({ isOpen, onClose, sessions, onDelete, onDownload }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative max-h-[80vh] flex flex-col">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                    <XMarkIcon className="h-6 w-6" />
                </button>
                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <LibraryIcon className="h-6 w-6 text-emerald-400" />
                    Thư viện Session
                </h3>
                <p className="text-slate-400 text-sm mb-6">Các phiên làm việc được lưu cục bộ trên trình duyệt.</p>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {sessions.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                            <p>Không tìm thấy phiên làm việc nào.</p>
                        </div>
                    ) : (
                        sessions.slice().reverse().map(session => (
                            <div key={session.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center justify-between group hover:border-slate-600 transition-colors">
                                <div>
                                    <h4 className="font-bold text-slate-200 text-sm mb-1">{session.name || 'Session không tên'}</h4>
                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <span className="flex items-center gap-1"><ClockIcon className="h-3 w-3" /> {formatDate(session.timestamp)}</span>
                                        <span className="bg-slate-800 px-2 py-0.5 rounded text-emerald-400 font-mono">{session.prompts.length} cảnh</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                     <button 
                                        onClick={() => onDownload(session)}
                                        className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-900/20 rounded-lg transition-colors"
                                        title="Tải Excel"
                                     >
                                        <DownloadIcon className="h-5 w-5" />
                                    </button>
                                    <button 
                                        onClick={() => onDelete(session.id)}
                                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Xóa"
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

interface ControlPanelProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  scenario: string;
  setScenario: (value: string) => void;
  referenceImages: ImageFile[];
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onScriptUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBuildPrompts: () => void;
  isBuilding: boolean;
  scriptFileName: string | null;
  segmentationMode: 'ai' | 'punctuation' | 'fixed';
  setSegmentationMode: (mode: 'ai' | 'punctuation' | 'fixed') => void;
  hasPrompts: boolean;
  targetSceneCount: number;
  setTargetSceneCount: (count: number) => void;
  promptType: PromptType;
  setPromptType: (type: PromptType) => void;
  selectedStyleId: string;
  setSelectedStyleId: (id: string) => void;
}
const ControlPanel: FC<ControlPanelProps> = ({ 
    mode, setMode, scenario, setScenario, referenceImages, 
    onImageUpload, onScriptUpload, onBuildPrompts, isBuilding, 
    scriptFileName, 
    segmentationMode, setSegmentationMode, hasPrompts,
    targetSceneCount, setTargetSceneCount,
    promptType, setPromptType,
    selectedStyleId, setSelectedStyleId
}) => {
  const charImgRef = useRef<HTMLInputElement>(null);
  const scriptFileRef = useRef<HTMLInputElement>(null);
  const [isRefImagesExpanded, setIsRefImagesExpanded] = useState(false);
  
  const scriptReady = useMemo(() => scenario.trim() !== "" || scriptFileName !== null, [scenario, scriptFileName]);

  const canBuild = useMemo(() => {
      return scriptReady;
  }, [scriptReady]);

  return (
    <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl sticky top-6 shadow-2xl backdrop-blur-md">
      
      <h2 className="text-xl font-bold text-emerald-400 mb-6">1. Cấu hình</h2>
      
      <div className="flex flex-col gap-6">
          {/* COLUMN 1: Inputs */}
          <div className="flex flex-col gap-6">
            
            {/* Style Selector */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">🎭 Chọn Phong Cách Image/Video</label>
                <div className="relative">
                    <select
                        value={selectedStyleId}
                        onChange={(e) => setSelectedStyleId(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 appearance-none cursor-pointer"
                    >
                        <option value="reference">📸 Sử dụng ảnh tham chiếu (Mặc định)</option>
                        {PRESET_STYLES.map(style => (
                            <option key={style.id} value={style.id}>
                                {style.label}
                            </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                        <ChevronDownIcon className="h-4 w-4" />
                    </div>
                </div>
                {selectedStyleId !== 'reference' && (
                     <p className="text-xs text-slate-500 mt-2 italic">
                        * Khi chọn phong cách có sẵn, công cụ sẽ bỏ qua ảnh tham chiếu.
                    </p>
                )}
            </div>

            {/* Reference Images (Visible ONLY if style is 'reference') */}
            {selectedStyleId === 'reference' && (
                <div className="animate-fade-in border border-slate-700 rounded-xl overflow-hidden">
                    <button 
                        onClick={() => setIsRefImagesExpanded(!isRefImagesExpanded)}
                        className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors"
                    >
                        <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                            📸 Tải lên Ảnh tham chiếu 
                            <span className="text-xs text-slate-500 font-normal">(Tối đa {MAX_REFERENCE_IMAGES})</span>
                        </span>
                        {isRefImagesExpanded ? (
                            <ChevronUpIcon className="h-4 w-4 text-slate-400" /> 
                        ) : (
                            <ChevronDownIcon className="h-4 w-4 text-slate-400" />
                        )}
                    </button>
                    
                    {isRefImagesExpanded && (
                        <div className="p-4 bg-slate-900/30 border-t border-slate-700 animate-fade-in">
                            <div 
                                onClick={() => charImgRef.current?.click()}
                                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md cursor-pointer hover:border-emerald-500 transition-colors bg-slate-800/30"
                            >
                                <div className="space-y-1 text-center">
                                <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
                                <p className="text-sm text-slate-400">Nhấn để tải file</p>
                                </div>
                            </div>
                            <input ref={charImgRef} type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" />
                            <p className="text-xs text-amber-300 mt-3 font-semibold bg-amber-900/30 p-2.5 rounded-lg border border-amber-500/30 shadow-sm flex items-center gap-2">
                                <InformationCircleIcon className="h-4 w-4 flex-shrink-0" />
                                AI sẽ phân tích các ảnh này để nhúng phong cách vào Prompt tạo ảnh.
                            </p>
                            {referenceImages.length > 0 && (
                                <div className="mt-4 grid grid-cols-3 gap-2">
                                {referenceImages.map((img) => (
                                    <div key={img.name} className="relative group">
                                        <img src={img.dataUrl} alt={img.name} className="rounded-md object-cover aspect-square border border-slate-700 shadow-sm" />
                                    </div>
                                ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Script Upload */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">📄 Tải lên Kịch bản (.txt, .srt)</label>
                <div 
                    onClick={() => scriptFileRef.current?.click()}
                    className="flex items-center gap-3 bg-slate-800 border border-slate-700 hover:border-emerald-500 p-3 rounded-md cursor-pointer transition-colors group"
                >
                    <DocumentIcon className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <span className="text-sm text-slate-300 truncate">{scriptFileName || 'Chọn file kịch bản...'}</span>
                </div>
                <input ref={scriptFileRef} type="file" accept=".txt,.srt" onChange={onScriptUpload} className="hidden" />
            </div>

            {/* Manual Input */}
            <div>
                <label htmlFor="scenario" className="block text-sm font-medium text-slate-300 mb-2">📜 Hoặc nhập kịch bản thủ công</label>
                <textarea
                id="scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="Nhập nội dung kịch bản tại đây..."
                rows={6}
                className="w-full bg-slate-800 border border-slate-700 p-3 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition shadow-inner text-white text-sm"
                ></textarea>
                <p className="text-[10px] text-slate-500 mt-1 italic font-semibold text-emerald-400/80">* Được hỗ trợ bởi Gemini 3 Pro Preview (Mô hình Tư duy)</p>
            </div>
          </div>

          {/* COLUMN 2: Actions */}
          <div className="flex flex-col gap-6">

            {/* Prompt Type Selector */}
             <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">🎨 Loại Output</label>
                <div className="flex gap-3 mb-4">
                    <button
                        onClick={() => setPromptType('image')}
                        className={`flex-1 p-3 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 ${promptType === 'image' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <PhotoIcon className="h-5 w-5 mb-1" />
                        <span>Ảnh (Nano Banana)</span>
                    </button>
                    <button
                        onClick={() => setPromptType('video')}
                        className={`flex-1 p-3 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 ${promptType === 'video' ? 'bg-rose-600 border-rose-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <VideoCameraIcon className="h-5 w-5 mb-1" />
                        <span>Video (Veo/Sora)</span>
                    </button>
                </div>
            </div>

            {/* Segmentation Options & Generate Button Group */}
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">✂️ Phương pháp phân cảnh</label>
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                        onClick={() => setSegmentationMode('ai')}
                        className={`p-3 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 ${segmentationMode === 'ai' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <span>🤖 AI Tự động</span>
                        <span className="font-medium opacity-70 text-[10px]">7-15 từ/cảnh</span>
                    </button>
                    <button
                        onClick={() => setSegmentationMode('punctuation')}
                        className={`p-3 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 ${segmentationMode === 'punctuation' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <span>📝 Dấu chấm câu</span>
                        <span className="font-medium opacity-70 text-[10px]">Theo câu hoàn chỉnh</span>
                    </button>
                    <button
                        onClick={() => setSegmentationMode('fixed')}
                        className={`p-3 rounded-xl text-xs font-bold transition-all border shadow-lg flex flex-col items-center gap-1 ${segmentationMode === 'fixed' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'}`}
                    >
                        <span>🔢 Số cảnh cố định</span>
                        <span className="font-medium opacity-70 text-[10px]">Chia theo số lượng</span>
                    </button>

                     <div className={`p-2 rounded-xl border flex flex-col justify-center items-center transition-all duration-300 ${segmentationMode === 'fixed' ? 'bg-slate-900 border-emerald-500/50 opacity-100' : 'bg-slate-900/50 border-slate-800 opacity-40 pointer-events-none'}`}>
                        <label className="text-[10px] font-bold text-slate-400 mb-1 uppercase text-center">Số lượng cảnh</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="50"
                            value={targetSceneCount}
                            onChange={(e) => setTargetSceneCount(Math.max(1, parseInt(e.target.value) || 10))}
                            className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded text-center text-white text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            disabled={segmentationMode !== 'fixed'}
                        />
                    </div>
                </div>

                <button
                    onClick={onBuildPrompts}
                    disabled={!canBuild || isBuilding}
                    className={`w-full py-3 px-4 rounded-md font-semibold transition-all flex items-center justify-center text-white ${hasPrompts ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'} disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed shadow-lg`}
                >
                    {isBuilding ? <SpinnerIcon className="animate-spin h-5 w-5 mr-2" /> : hasPrompts ? <ArrowPathIcon className="h-5 w-5 mr-2" /> : null}
                    {isBuilding ? 'AI đang phân tích...' : hasPrompts ? 'Tạo lại Storyboard Pro' : 'Tạo Storyboard Pro'}
                </button>
            </div>
          </div>
      </div>
    </div>
  );
};

const App: FC = () => {
  // State
  const [mode, setMode] = useState<AppMode>('general');
  const [scenario, setScenario] = useState<string>('');
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ImageFile[]>([]);
  const [prompts, setPrompts] = useState<ScenePrompt[]>([]);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [segmentationMode, setSegmentationMode] = useState<'ai' | 'punctuation' | 'fixed'>('ai');
  const [targetSceneCount, setTargetSceneCount] = useState<number>(10);
  const [promptType, setPromptType] = useState<PromptType>('image');
  const [selectedStyleId, setSelectedStyleId] = useState<string>('reference'); // Default to reference/default
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  // API & Settings State
  const [apiKey, setApiKey] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');
  const [showApiModal, setShowApiModal] = useState(false);
  
  // Library State
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

  // Load saved sessions on mount
  useEffect(() => {
    const saved = localStorage.getItem('sbgen_sessions');
    if (saved) {
        try {
            setSavedSessions(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load sessions", e);
        }
    }
  }, []);

  // Save sessions helper
  const saveSession = (newPrompts: ScenePrompt[], scriptName: string) => {
      const newSession: SavedSession = {
          id: Date.now().toString(),
          name: scriptName || `Untitled ${new Date().toLocaleTimeString()}`,
          timestamp: Date.now(),
          prompts: newPrompts
      };
      const updatedSessions = [...savedSessions, newSession];
      setSavedSessions(updatedSessions);
      localStorage.setItem('sbgen_sessions', JSON.stringify(updatedSessions));
  };

  const handleDeleteSession = (id: string) => {
      const updated = savedSessions.filter(s => s.id !== id);
      setSavedSessions(updated);
      localStorage.setItem('sbgen_sessions', JSON.stringify(updated));
      addToast('info', 'Đã xóa', 'Đã xóa phiên làm việc khỏi thư viện.');
  };

  const handleDownloadSession = (session: SavedSession) => {
      exportToExcel(session.prompts, `storyboard_${session.name.replace(/\s+/g, '_')}`);
      // Also download TXT for consistency with old behavior if needed, but Excel usually suffices. 
      // Let's create a TXT as well for "AudioScriptImageSync" compatibility mentioned in guide.
      const txtContent = session.prompts.map(p => `${p.scriptLine}`).join('\n');
      const blob = new Blob([txtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `script_${session.name.replace(/\s+/g, '_')}_${session.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };


  // Toast Helper
  const addToast = (type: ToastType, title: string, message: string) => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // Handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files: File[] = Array.from(e.target.files) as File[];
      if (referenceImages.length + files.length > MAX_REFERENCE_IMAGES) {
        addToast('error', 'Quá giới hạn', `Tối đa ${MAX_REFERENCE_IMAGES} ảnh tham chiếu.`);
        return;
      }
      
      const newImages: ImageFile[] = [];
      for (const file of files) {
          try {
              const { dataUrl, mimeType } = await fileToDataUrl(file);
              const base64 = dataUrlToBase64(dataUrl);
              newImages.push({ name: file.name, dataUrl, base64, mimeType });
          } catch (err) {
              console.error(err);
              addToast('error', 'Lỗi tải lên', `Không thể xử lý ${file.name}`);
          }
      }
      setReferenceImages(prev => [...prev, ...newImages]);
    }
  };

  const handleScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target?.result as string;
          setScriptFileName(file.name);
          if (file.name.endsWith('.srt')) {
              setScenario(content);
          } else {
              setScenario(content);
          }
          addToast('success', 'Đã tải kịch bản', `Đã tải ${file.name}`);
      };
      reader.readAsText(file);
  };

  const handleBuildPrompts = async () => {
      if (!scenario) return;
      setIsBuilding(true);
      try {
           // Priority: User Input > Env Var
           const effectiveKey = apiKey || process.env.API_KEY || "";
           if (!effectiveKey) {
             addToast('error', 'Thiếu API Key', 'Vui lòng cấu hình API Key trong Cài đặt.');
             setShowApiModal(true);
             setIsBuilding(false);
             return;
          }
          
          let refImagesForService: { base64: string; mimeType: string }[] = [];
          let activeStylePrompt = "";

          // Logic for Style Selection vs Reference Images
          if (selectedStyleId === 'reference') {
             // If reference mode selected, pass the uploaded images
             refImagesForService = referenceImages.map(img => ({ base64: img.base64, mimeType: img.mimeType }));
             
             if (refImagesForService.length > 0) {
                 // Use specific instruction to follow image style
                 activeStylePrompt = "Analyze the provided reference images and apply their exact art style, color palette, and lighting to the prompt.";
             } else {
                 // No images provided in reference mode -> Neutral/Content-based style
                 activeStylePrompt = "Visual Style: Neutral, realistic, high quality. Visualize the scene based strictly on the script content.";
             }
          } else {
             // A Preset is selected
             // Force ignore reference images even if they exist in state
             refImagesForService = []; 
             const selectedStyleObj = PRESET_STYLES.find(s => s.id === selectedStyleId);
             activeStylePrompt = selectedStyleObj ? selectedStyleObj.prompt : "";
          }

          const results = await analyzeScriptWithAI(
              scenario,
              refImagesForService,
              effectiveKey,
              activeStylePrompt, 
              mode,
              segmentationMode,
              selectedModel,
              targetSceneCount,
              promptType
          );
          
          const newPrompts = results.map((item: any, index: number) => ({
              id: Date.now() + index,
              phase: item.phase,
              imagePrompt: item.imagePrompt, // might be undefined if promptType=video
              videoPrompt: item.videoPrompt, // might be undefined if promptType=image
              scriptLine: item.scriptLine
          }));
          
          setPrompts(newPrompts);
          saveSession(newPrompts, scriptFileName || "Manual Scenario"); // Auto-save to library
          addToast('success', 'Thành công', `Đã tạo ${newPrompts.length} cảnh & Lưu vào Thư viện.`);
          
      } catch (error: any) {
          addToast('error', 'Lỗi tạo nội dung', error.message);
      } finally {
          setIsBuilding(false);
      }
  };
  
  const handleDownloadExcel = () => {
      exportToExcel(prompts);
  };

  const handleDownloadTxt = () => {
      if (prompts.length === 0) return;
      const txtContent = prompts.map(p => p.scriptLine).join('\n');
      const blob = new Blob([txtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `script_${getTimestamp()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
        <ToastContainer toasts={toasts} onClose={removeToast} />
        
        {/* Modals */}
        <ApiSettingsModal 
            isOpen={showApiModal} 
            onClose={() => setShowApiModal(false)}
            apiKey={apiKey}
            setApiKey={setApiKey}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
        />
        
        <LibraryModal 
            isOpen={showLibraryModal}
            onClose={() => setShowLibraryModal(false)}
            sessions={savedSessions}
            onDelete={handleDeleteSession}
            onDownload={handleDownloadSession}
        />

        <GuideModal 
            isOpen={showGuideModal}
            onClose={() => setShowGuideModal(false)}
        />

        <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div 
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" 
                    onClick={() => window.location.reload()}
                    title="Làm mới ứng dụng"
                >
                    <div className="w-8 h-8 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-lg flex items-center justify-center text-slate-900 font-bold text-xl shadow-lg shadow-emerald-500/20">S</div>
                    <h1 className="font-bold text-lg tracking-tight text-white">Storyboard<span className="text-emerald-400">Gen</span> AI</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setShowGuideModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-sm font-medium border border-slate-700"
                    >
                        <BookOpenIcon className="h-4 w-4" />
                        Hướng dẫn
                    </button>
                    <button 
                        onClick={() => setShowLibraryModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-sm font-medium border border-slate-700"
                    >
                        <LibraryIcon className="h-4 w-4" />
                        Thư viện
                    </button>
                    <button 
                        onClick={() => setShowApiModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 transition-colors text-sm font-bold border border-emerald-500/30"
                    >
                        <KeyIcon className="h-4 w-4" />
                        API
                    </button>
                </div>
            </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                    <ControlPanel 
                        mode={mode}
                        setMode={setMode}
                        scenario={scenario}
                        setScenario={setScenario}
                        referenceImages={referenceImages}
                        onImageUpload={handleImageUpload}
                        onScriptUpload={handleScriptUpload}
                        onBuildPrompts={handleBuildPrompts}
                        isBuilding={isBuilding}
                        scriptFileName={scriptFileName}
                        segmentationMode={segmentationMode}
                        setSegmentationMode={setSegmentationMode}
                        hasPrompts={prompts.length > 0}
                        targetSceneCount={targetSceneCount}
                        setTargetSceneCount={setTargetSceneCount}
                        promptType={promptType}
                        setPromptType={setPromptType}
                        selectedStyleId={selectedStyleId}
                        setSelectedStyleId={setSelectedStyleId}
                    />
                </div>

                <div className="lg:col-span-8">
                    {prompts.length === 0 ? (
                        <WelcomeGuide />
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <SparklesIcon className="h-5 w-5 text-emerald-400" />
                                    Storyboard đã tạo ({prompts.length} cảnh)
                                </h2>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={handleDownloadTxt}
                                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2 border border-slate-600"
                                    >
                                        <TextDocumentIcon className="h-4 w-4" /> Xuất Script (.txt)
                                    </button>
                                    <button 
                                        onClick={handleDownloadExcel}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                                    >
                                        <DownloadIcon className="h-4 w-4" /> Xuất Excel
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                {prompts.map((scene, idx) => (
                                    <div key={scene.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-emerald-500/30 transition-all shadow-sm">
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="bg-slate-800 text-slate-400 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">Cảnh {idx + 1}</span>
                                            <span className="text-xs font-mono text-emerald-400">{scene.phase}</span>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-slate-300 italic font-medium border-l-2 border-emerald-500/50 pl-3 py-1">"{scene.scriptLine}"</p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 text-sm">
                                            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                                                <p className="text-xs text-slate-500 font-bold mb-1 uppercase">
                                                    {scene.videoPrompt ? "Mô tả Video (Veo/Sora)" : "Mô tả Hình ảnh"}
                                                </p>
                                                <p className="text-slate-300 leading-relaxed text-xs">
                                                    {scene.videoPrompt || scene.imagePrompt}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    </div>
  );
};

export default App;
