
import React, { useState, useRef, useCallback, FC, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { generateImageFromPrompt, analyzeScriptWithAI, standardizeScriptWithAI, generateSpeechFromText } from './services/geminiService';

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
  imagePrompt: string;
  videoPrompt: string;
  scriptLine: string;
  generatedImageUrl?: string;
  isLoading?: boolean;
  audioUrl?: string;     // URL blob của file wav
  isAudioLoading?: boolean;
}

export interface ApiKey {
    id: string;
    provider: 'Google' | 'OpenAI';
    key: string;
    name: string;
    isActive: boolean;
}

type AppMode = 'prehistoric' | 'japan';

// Cập nhật Style: Dùng keywords mạnh để khóa phong cách Photorealism
const PREHISTORIC_STYLE = `Style: Award-winning National Geographic Photography. 
Keywords: 8k resolution, ultra-realistic, cinematic lighting, film grain, raw photo, shallow depth of field, 45mm lens. 
Negative prompt: cartoon, anime, 3d render, painting, drawing, illustration, low quality.
Character Consistency: match the uploaded reference exactly.`;

// Cập nhật Style: Dùng keywords mạnh để khóa phong cách Anime Movie (Ghibli/Makoto Shinkai style)
const JAPAN_STYLE = `Style: High-quality Anime Movie Screenshot (Studio Ghibli / Makoto Shinkai inspired). 
Keywords: 2D hand-painted background, cell shading, soft amber lighting, nostalgic atmosphere, highly detailed, 4k, emotional art. 
Negative prompt: 3D render, photorealistic, realistic, photograph, western cartoon, cgi, low resolution, blurry.
Character: An elderly Japanese woman (70s), kind face, wrinkles, gray hair tied back, wearing simple domestic clothes.`;

const MAX_REFERENCE_IMAGES = 3;

// Các giọng đọc hỗ trợ bởi Gemini (gemini-2.5-flash-preview-tts)
const AVAILABLE_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

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

const parseSrt = (content: string): string => {
  const lines = content.replace(/\r/g, '').split('\n');
  let dialogue = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^\d+$/.test(line) || line.includes('-->')) continue;
    dialogue += " " + line;
  }
  return dialogue.trim();
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

const CopyIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
);

const DownloadIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const RefreshIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
);

const PlayIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
    </svg>
);

const ZipIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
);

const WarningIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
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

const SparklesIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
  </svg>
);

const SpeakerIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
);

const MusicalNoteIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Z" />
    </svg>
);


// --- CHILD COMPONENTS ---

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
  onStandardizeScript: () => void;
  isStandardizing: boolean;
  standardizedScript: string | null;
  onDownloadStandardized: () => void;
}
const ControlPanel: FC<ControlPanelProps> = ({ 
    mode, setMode, scenario, setScenario, referenceImages, 
    onImageUpload, onScriptUpload, onBuildPrompts, isBuilding, 
    scriptFileName, onStandardizeScript, isStandardizing, standardizedScript, onDownloadStandardized
}) => {
  const charImgRef = useRef<HTMLInputElement>(null);
  const scriptFileRef = useRef<HTMLInputElement>(null);

  const scriptReady = useMemo(() => scenario.trim() !== "" || scriptFileName !== null, [scenario, scriptFileName]);

  const canBuild = useMemo(() => {
      if (mode === 'prehistoric') return scriptReady && referenceImages.length === MAX_REFERENCE_IMAGES;
      return scriptReady;
  }, [mode, referenceImages, scriptReady]);

  return (
    <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl flex flex-col gap-6 sticky top-6 shadow-2xl backdrop-blur-md">
      <div className="flex bg-slate-800 p-1 rounded-xl">
        <button 
            onClick={() => setMode('prehistoric')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'prehistoric' ? 'bg-emerald-500 text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}
        >
            Người Tiền Sử
        </button>
        <button 
            onClick={() => setMode('japan')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'japan' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
        >
            Nhật Bản
        </button>
      </div>

      <h2 className="text-xl font-bold text-emerald-400">1. Setup</h2>
      
      {mode === 'prehistoric' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">📸 Upload {MAX_REFERENCE_IMAGES} Character Images</label>
            <div 
              onClick={() => charImgRef.current?.click()}
              className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md cursor-pointer hover:border-emerald-500 transition-colors"
            >
              <div className="space-y-1 text-center">
                <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
                <p className="text-sm text-slate-400">Click to upload files</p>
              </div>
            </div>
            <input ref={charImgRef} type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" />
            {referenceImages.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-4">
                {referenceImages.map((img) => (
                  <img key={img.name} src={img.dataUrl} alt={img.name} className="rounded-md object-cover aspect-square border border-slate-700 shadow-sm" />
                ))}
              </div>
            )}
          </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">📄 Upload Script (.txt, .srt)</label>
        <div 
            onClick={() => scriptFileRef.current?.click()}
            className="flex items-center gap-3 bg-slate-800 border border-slate-700 hover:border-emerald-500 p-3 rounded-md cursor-pointer transition-colors group"
        >
            <DocumentIcon className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm text-slate-300 truncate">{scriptFileName || 'Chọn file kịch bản...'}</span>
        </div>
        <input ref={scriptFileRef} type="file" accept=".txt,.srt" onChange={onScriptUpload} className="hidden" />
      </div>

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
        <p className="text-[10px] text-slate-500 mt-1 italic font-semibold text-emerald-400/80">* Powered by Gemini 3 Pro Preview (Reasoning Model)</p>
      </div>
      
      {/* Standardize Script Button */}
      <div className="border-t border-slate-800 pt-4">
          {!standardizedScript ? (
              <button
                onClick={onStandardizeScript}
                disabled={!scriptReady || isStandardizing}
                className="w-full py-2.5 px-4 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-slate-800 text-emerald-400 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStandardizing ? <SpinnerIcon className="animate-spin h-4 w-4" /> : <SparklesIcon className="h-4 w-4" />}
                {isStandardizing ? 'Cleaning...' : 'Chuẩn hóa kịch bản (TTS Ready)'}
              </button>
          ) : (
              <button
                onClick={onDownloadStandardized}
                className="w-full py-2.5 px-4 rounded-md font-bold text-sm transition-all flex items-center justify-center gap-2 bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900 border border-emerald-500/50"
              >
                <DownloadIcon className="h-4 w-4" />
                Tải kịch bản đã chuẩn hóa
              </button>
          )}
          <p className="text-[10px] text-slate-500 mt-2 text-center">Tự động làm sạch dấu câu, định dạng thừa để đọc AI tốt hơn.</p>
      </div>

      <button
        onClick={onBuildPrompts}
        disabled={!canBuild || isBuilding}
        className={`w-full py-3 px-4 rounded-md font-semibold transition-all flex items-center justify-center ${
            mode === 'prehistoric' 
                ? 'text-black bg-emerald-500 hover:bg-emerald-400' 
                : 'text-white bg-indigo-600 hover:bg-indigo-500'
        } disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed shadow-lg mt-2`}
      >
        {isBuilding ? <SpinnerIcon className="animate-spin h-5 w-5 mr-2" /> : null}
        {isBuilding ? 'AI is analyzing...' : 'Generate Pro Storyboard'}
      </button>
    </div>
  );
};

interface PromptCardProps {
    prompt: ScenePrompt;
    onGenerateImage: (id: number) => void;
    onGenerateAudio: (id: number) => void;
}
const PromptCard: FC<PromptCardProps> = ({ prompt, onGenerateImage, onGenerateAudio }) => {
    const [copied, setCopied] = useState('');

    const handleCopy = (text: string, type: string) => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(''), 2000);
    };
    
    const handleImageDownload = () => {
        if (!prompt.generatedImageUrl) return;
        const a = document.createElement('a');
        a.href = prompt.generatedImageUrl;
        const timestamp = getTimestamp();
        a.download = `Scene ${prompt.id}_${timestamp}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="bg-slate-950/30 border border-slate-800 p-4 rounded-xl transition-all hover:border-slate-700 animate-fade-in shadow-sm">
            <div className="flex justify-between items-start mb-3">
                <div className="flex-1 pr-4">
                    <h3 className="font-semibold text-emerald-400 mb-1">Scene {prompt.id}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed italic">"{prompt.scriptLine}"</p>
                </div>
                <span className="text-xs font-medium bg-slate-700 text-slate-300 px-2 py-1 rounded-full whitespace-nowrap">{prompt.phase}</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold text-slate-300">Image Prompt</h4>
                        <button onClick={() => handleCopy(prompt.imagePrompt, 'image')} className="text-slate-400 hover:text-white transition">
                            {copied === 'image' ? 'Copied!' : <CopyIcon className="h-4 w-4" />}
                        </button>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap bg-slate-800/50 p-3 rounded-md font-mono text-slate-400 h-24 overflow-y-auto border border-slate-700">{prompt.imagePrompt}</pre>
                </div>
                
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold text-slate-300">Video Prompt</h4>
                        <button onClick={() => handleCopy(prompt.videoPrompt, 'video')} className="text-slate-400 hover:text-white transition">
                            {copied === 'video' ? 'Copied!' : <CopyIcon className="h-4 w-4" />}
                        </button>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap bg-slate-800/50 p-3 rounded-md font-mono text-slate-400 h-24 overflow-y-auto border border-slate-700">{prompt.videoPrompt}</pre>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 grid md:grid-cols-2 gap-4">
                {/* Image Section */}
                <div>
                    {prompt.isLoading ? (
                         <div className="w-full aspect-video bg-slate-800 rounded-lg flex items-center justify-center">
                            <SpinnerIcon className="animate-spin h-8 w-8 text-emerald-500" />
                         </div>
                    ) : prompt.generatedImageUrl ? (
                        <div className="relative group">
                          <img src={prompt.generatedImageUrl} alt={`Generated for Scene ${prompt.id}`} className="w-full aspect-video object-cover rounded-lg shadow-lg" />
                          
                          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => onGenerateImage(prompt.id)} 
                                className="bg-black/60 p-2 rounded-full text-white hover:bg-emerald-500 transition-colors shadow-lg"
                                title="Tạo lại ảnh"
                            >
                                <RefreshIcon className="h-5 w-5"/>
                            </button>
                            <button 
                                onClick={handleImageDownload} 
                                className="bg-black/60 p-2 rounded-full text-white hover:bg-emerald-500 transition-colors shadow-lg"
                                title="Tải ảnh"
                            >
                                <DownloadIcon className="h-5 w-5"/>
                            </button>
                          </div>
                        </div>
                    ) : (
                        <button onClick={() => onGenerateImage(prompt.id)} className="w-full py-2 bg-slate-700 hover:bg-emerald-600 transition-colors rounded-lg text-sm font-semibold shadow-md border border-slate-600 flex items-center justify-center gap-2">
                            <SparklesIcon className="h-4 w-4" /> Generate Image
                        </button>
                    )}
                </div>

                {/* Audio Section */}
                <div className="flex flex-col justify-end">
                     {prompt.isAudioLoading ? (
                        <div className="w-full h-10 bg-slate-800 rounded-lg flex items-center justify-center gap-2 text-sm text-slate-400">
                             <SpinnerIcon className="animate-spin h-4 w-4 text-indigo-500" /> Generating Voice...
                        </div>
                     ) : prompt.audioUrl ? (
                         <div className="space-y-2">
                             <audio controls src={prompt.audioUrl} className="w-full h-10 block rounded-lg bg-slate-100" />
                             <button 
                                onClick={() => onGenerateAudio(prompt.id)}
                                className="w-full text-xs text-slate-500 hover:text-indigo-400 flex items-center justify-center gap-1 transition-colors"
                             >
                                <RefreshIcon className="h-3 w-3" /> Regenerate Voice
                             </button>
                         </div>
                     ) : (
                         <button onClick={() => onGenerateAudio(prompt.id)} className="w-full py-2 bg-slate-800 hover:bg-indigo-600 text-indigo-200 hover:text-white transition-colors rounded-lg text-sm font-semibold shadow-md border border-slate-700 flex items-center justify-center gap-2">
                             <SpeakerIcon className="h-4 w-4" /> Generate Voice
                         </button>
                     )}
                </div>
            </div>
        </div>
    );
};

interface PromptDisplayProps {
    prompts: ScenePrompt[];
    onGenerateImage: (id: number) => void;
    onDownloadAllPrompts: () => void;
    onGenerateAll: () => void;
    onDownloadAllImages: () => void;
    isGeneratingAll: boolean;
    onGenerateAudio: (id: number) => void;
    onGenerateAllAudio: () => void;
    onDownloadAllAudio: () => void;
    isGeneratingAllAudio: boolean;
}
const PromptDisplay: FC<PromptDisplayProps> = ({ 
    prompts, onGenerateImage, onDownloadAllPrompts, onGenerateAll, onDownloadAllImages, isGeneratingAll,
    onGenerateAudio, onGenerateAllAudio, onDownloadAllAudio, isGeneratingAllAudio
}) => {
    const hasMissingImages = useMemo(() => prompts.some(p => !p.generatedImageUrl), [prompts]);
    const hasGeneratedImages = useMemo(() => prompts.some(p => p.generatedImageUrl), [prompts]);
    const hasMissingAudio = useMemo(() => prompts.some(p => !p.audioUrl), [prompts]);
    const hasGeneratedAudio = useMemo(() => prompts.some(p => p.audioUrl), [prompts]);

    if (prompts.length === 0) {
        return (
            <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl flex items-center justify-center min-h-[50vh] shadow-inner backdrop-blur-sm">
                <div className="text-center text-slate-500 max-w-sm">
                    <h2 className="text-xl font-bold text-slate-400 mb-2">Chưa có phân cảnh nào</h2>
                    <p className="text-sm">Tải lên kịch bản và nhấn "Generate Pro Storyboard" để AI bắt đầu phân tách và tạo prompt hình ảnh.</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl animate-fade-in shadow-xl backdrop-blur-sm">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                    <span className="w-2 h-8 bg-emerald-500 rounded-full"></span>
                    2. AI Generated Prompts ({prompts.length} scenes)
                </h2>
                <div className="flex flex-col md:flex-row gap-2">
                    <div className="flex gap-2">
                        {/* Audio Buttons */}
                        <button
                             onClick={onGenerateAllAudio}
                             disabled={isGeneratingAllAudio || !hasMissingAudio}
                             className={`text-xs font-bold py-2 px-3 rounded-lg transition-all flex items-center gap-2 shadow-md ${
                                isGeneratingAllAudio
                                    ? 'bg-slate-600 cursor-not-allowed text-slate-400'
                                    : hasMissingAudio
                                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                        : 'bg-slate-700 text-slate-400 cursor-default'
                             }`}
                             title="Tạo giọng đọc cho các câu còn thiếu"
                        >
                            {isGeneratingAllAudio ? <SpinnerIcon className="animate-spin h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
                            {isGeneratingAllAudio ? 'TTS...' : 'Gen All Audio'}
                        </button>
                        
                         {hasGeneratedAudio && (
                            <button
                                onClick={onDownloadAllAudio}
                                className="bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 text-xs font-semibold py-2 px-3 rounded-lg transition-all flex items-center gap-2 shadow-md border border-indigo-700/50"
                            >
                                <MusicalNoteIcon className="h-4 w-4" /> ZIP Audio
                            </button>
                        )}
                    </div>

                    <div className="flex gap-2">
                        {/* Image Buttons */}
                        <button 
                            onClick={onGenerateAll} 
                            disabled={isGeneratingAll || !hasMissingImages}
                            className={`text-xs font-bold py-2 px-3 rounded-lg transition-all flex items-center gap-2 shadow-md ${
                                isGeneratingAll 
                                    ? 'bg-slate-600 cursor-not-allowed text-slate-400' 
                                    : hasMissingImages 
                                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                        : 'bg-slate-700 text-slate-400 cursor-default'
                            }`}
                        >
                            {isGeneratingAll ? <SpinnerIcon className="animate-spin h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                            {isGeneratingAll ? 'Img...' : 'Gen All Img'}
                        </button>

                         {hasGeneratedImages && (
                            <button 
                                onClick={onDownloadAllImages} 
                                className="bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 text-xs font-semibold py-2 px-3 rounded-lg transition-all flex items-center gap-2 shadow-md border border-emerald-700/50"
                            >
                                <ZipIcon className="h-4 w-4" /> ZIP Img
                            </button>
                        )}

                        <button onClick={onDownloadAllPrompts} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-all flex items-center gap-2 shadow-md">
                            <DownloadIcon className="h-4 w-4" /> Excel
                        </button>
                    </div>
                </div>
            </div>
             <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
                {prompts.map((p) => (
                    <PromptCard key={p.id} prompt={p} onGenerateImage={onGenerateImage} onGenerateAudio={onGenerateAudio} />
                ))}
             </div>
        </div>
    );
};

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    apiKeys: ApiKey[];
    onAddKey: (provider: ApiKey['provider'], name: string, key: string) => void;
    onDeleteKey: (id: string) => void;
    onSetActiveKey: (id: string) => void;
    selectedModel: string;
    onSelectModel: (model: string) => void;
    selectedVoice: string;
    onSelectVoice: (voice: string) => void;
}
const ApiKeyModal: FC<ApiKeyModalProps> = ({ 
    isOpen, onClose, apiKeys, onAddKey, onDeleteKey, onSetActiveKey, 
    selectedModel, onSelectModel, selectedVoice, onSelectVoice 
}) => {
    const [newKeyValue, setNewKeyValue] = useState('');
    const [activeProvider, setActiveProvider] = useState<ApiKey['provider']>('Google');

    if (!isOpen) return null;

    const handleAdd = () => {
        if (newKeyValue.trim()) {
            const existingCount = apiKeys.filter(k => k.provider === activeProvider).length;
            const name = `${activeProvider} Key ${existingCount + 1}`;
            onAddKey(activeProvider, name, newKeyValue);
            setNewKeyValue('');
        }
    };
    
    const maskKey = (key: string) => `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;

    const renderKeyList = (provider: ApiKey['provider']) => (
        apiKeys.filter(k => k.provider === provider).map(key => (
            <div key={key.id} className="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-sm">
                <div className="flex flex-col text-sm">
                    <span className="font-semibold text-white">{key.name}</span>
                    <span className="text-slate-400 font-mono text-xs">{maskKey(key.key)}</span>
                </div>
                <div className="flex items-center gap-2">
                    {key.isActive ? (
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-900/50 px-2 py-1 rounded-full border border-emerald-500/30">ACTIVE</span>
                    ) : (
                        <button onClick={() => onSetActiveKey(key.id)} className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-md transition shadow-sm">Set Active</button>
                    )}
                    <button onClick={() => onDeleteKey(key.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-md transition bg-slate-700/50 hover:bg-slate-700 shadow-sm"><TrashIcon className="h-4 w-4" /></button>
                </div>
            </div>
        ))
    );
    
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl relative">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold text-emerald-400">Settings</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-3xl font-light">&times;</button>
                </div>
                <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="model-select" className="block text-sm font-medium text-slate-300 mb-3">High-Quality Image Model</label>
                            <select
                                id="model-select"
                                value={selectedModel}
                                onChange={(e) => onSelectModel(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl focus:ring-2 focus:ring-emerald-500 transition text-white"
                            >
                                <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image (Best)</option>
                                <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (Fast)</option>
                            </select>
                        </div>
                        <div>
                             <label htmlFor="voice-select" className="block text-sm font-medium text-slate-300 mb-3">TTS Voice (Giọng đọc)</label>
                             <select
                                id="voice-select"
                                value={selectedVoice}
                                onChange={(e) => onSelectVoice(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl focus:ring-2 focus:ring-emerald-500 transition text-white"
                             >
                                 {AVAILABLE_VOICES.map(voice => (
                                     <option key={voice} value={voice}>{voice} (Google AI)</option>
                                 ))}
                             </select>
                             <p className="text-[10px] text-slate-500 mt-1">Hỗ trợ đa ngôn ngữ (bao gồm Tiếng Nhật).</p>
                        </div>
                    </div>

                    <div>
                        <div className="border-b border-slate-700 mb-6">
                            <nav className="-mb-px flex space-x-6">
                                <button onClick={() => setActiveProvider('Google')} className={`${activeProvider === 'Google' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white hover:border-slate-500'} whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm transition-colors`}>Google AI (Bắt buộc)</button>
                                <button onClick={() => setActiveProvider('OpenAI')} className={`${activeProvider === 'OpenAI' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-white hover:border-slate-500'} whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm transition-colors`}>OpenAI</button>
                            </nav>
                        </div>
                        <div className="space-y-4 p-1">
                             <div className="w-full">
                                <input type="password" placeholder="Dán API Key vào đây" value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} className="w-full bg-slate-800 border border-slate-700 p-3.5 rounded-xl focus:ring-2 focus:ring-emerald-500 transition text-sm text-white shadow-inner" />
                            </div>
                            <button onClick={handleAdd} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg active:scale-95">Thêm API Key mới</button>
                        </div>
                        <div className="mt-6 space-y-3">
                             {renderKeyList(activeProvider)}
                             {apiKeys.filter(k => k.provider === activeProvider).length === 0 && <p className="text-center text-slate-500 text-sm py-6">Chưa có API Key nào được lưu cho {activeProvider}.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('japan'); 
  const [scenario, setScenario] = useState("");
  const [scriptFileContent, setScriptFileContent] = useState<string | null>(null);
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ImageFile[]>([]);
  const [prompts, setPrompts] = useState<ScenePrompt[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Image Generation State
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  
  // Audio Generation State
  const [isGeneratingAllAudio, setIsGeneratingAllAudio] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [selectedModel, setSelectedModel] = useState('gemini-3-pro-image-preview');
  const [selectedVoice, setSelectedVoice] = useState('Kore');

  // Logic chuẩn hóa kịch bản
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [standardizedScript, setStandardizedScript] = useState<string | null>(null);

  useEffect(() => {
    try {
        const savedKeys = localStorage.getItem('apiKeys');
        if (savedKeys) setApiKeys(JSON.parse(savedKeys));
        const savedModel = localStorage.getItem('selectedModel');
        if (savedModel) setSelectedModel(savedModel);
        const savedVoice = localStorage.getItem('selectedVoice');
        if (savedVoice) setSelectedVoice(savedVoice);
    } catch (e) { console.error(e); }
  }, []); 

  const updateAndSaveKeys = (newKeys: ApiKey[]) => {
    setApiKeys(newKeys);
    localStorage.setItem('apiKeys', JSON.stringify(newKeys));
  };
  
  const handleSelectModel = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('selectedModel', model);
  }

  const handleSelectVoice = (voice: string) => {
      setSelectedVoice(voice);
      localStorage.setItem('selectedVoice', voice);
  }

  const handleAddKey = (provider: ApiKey['provider'], name: string, key: string) => {
    const newKey: ApiKey = { id: crypto.randomUUID(), provider, name, key, isActive: apiKeys.filter(k => k.provider === provider).length === 0 };
    updateAndSaveKeys([...apiKeys, newKey]);
  };

  const handleDeleteKey = (id: string) => updateAndSaveKeys(apiKeys.filter(k => k.id !== id));

  const handleSetActiveKey = (id: string) => {
    const keyToActivate = apiKeys.find(k => k.id === id);
    if (!keyToActivate) return;
    updateAndSaveKeys(apiKeys.map(k => k.provider === keyToActivate.provider ? { ...k, isActive: k.id === id } : k));
  };

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const files = Array.from(e.target.files).slice(0, MAX_REFERENCE_IMAGES);
      try {
          const imagePromises = files.map(async (file: File) => {
              const { dataUrl, mimeType } = await fileToDataUrl(file);
              return { name: file.name, dataUrl, base64: dataUrlToBase64(dataUrl), mimeType };
          });
          setReferenceImages(await Promise.all(imagePromises));
      } catch (err) { setError('Lỗi khi đọc file ảnh.'); }
  }, []);

  const handleScriptUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScriptFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
        setScriptFileContent(ev.target?.result as string);
        setScenario("");
        setStandardizedScript(null); // Reset standardized script on new upload
    };
    reader.readAsText(file);
  }, []);

  const downloadPromptsAsXLSX = useCallback((promptsToDownload: ScenePrompt[]) => {
    if (!promptsToDownload.length) return;
    try {
      const timestamp = getTimestamp();
      const data = [
        ["STT", "Phase", "Script Line", "Image Prompt", "Video Prompt"],
        ...promptsToDownload.map(p => [p.id, p.phase, p.scriptLine, p.imagePrompt, p.videoPrompt])
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      worksheet['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 60 }, { wch: 80 }, { wch: 80 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Prompts");
      XLSX.writeFile(workbook, `storyboard_pro_${timestamp}.xlsx`);
    } catch (err) {
      console.error("XLSX Export Error:", err);
      setError("Không thể xuất file XLSX.");
    }
  }, []);

  const handleStandardizeScript = useCallback(async () => {
    const activeGoogleKey = apiKeys.find(k => k.provider === 'Google' && k.isActive);
    if (!activeGoogleKey) {
        setError("Cần API Key Google để chuẩn hóa kịch bản.");
        setIsModalOpen(true);
        return;
    }

    let inputScript = scriptFileContent || scenario;
    if (!inputScript.trim()) {
        setError("Vui lòng nhập hoặc tải kịch bản.");
        return;
    }

    setIsStandardizing(true);
    setError(null);
    try {
        const cleaned = await standardizeScriptWithAI(inputScript, activeGoogleKey.key);
        setStandardizedScript(cleaned);
    } catch (err) {
        setError(`Lỗi chuẩn hóa: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
        setIsStandardizing(false);
    }
  }, [scriptFileContent, scenario, apiKeys]);

  const handleDownloadStandardizedScript = useCallback(() => {
      if (!standardizedScript) return;
      const blob = new Blob([standardizedScript], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const originalName = scriptFileName ? scriptFileName.substring(0, scriptFileName.lastIndexOf('.')) : 'script';
      const ext = scriptFileName && scriptFileName.endsWith('.srt') ? '.srt' : '.txt';
      a.download = `${originalName}_tts_ready${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  }, [standardizedScript, scriptFileName]);

  const handleBuildPrompts = useCallback(async () => {
    const activeGoogleKey = apiKeys.find(k => k.provider === 'Google' && k.isActive);
    if (!activeGoogleKey) {
        setError("Cần API Key Google để AI phân tích kịch bản.");
        setIsModalOpen(true);
        return;
    }

    if (mode === 'prehistoric' && referenceImages.length < MAX_REFERENCE_IMAGES) {
      setError(`Cần đủ ${MAX_REFERENCE_IMAGES} ảnh tham chiếu.`);
      return;
    }

    setIsBuilding(true);
    setError(null);

    try {
      let fullScript = "";
      // Nếu đã có script chuẩn hóa, ưu tiên dùng nó để tạo prompt tốt hơn (optional, ở đây user có thể tải về xong upload lại, hoặc dùng script gốc)
      // Hiện tại giữ logic cũ: ưu tiên file upload hoặc text box
      if (scriptFileContent && scriptFileName) {
          fullScript = scriptFileName.endsWith('.srt') ? parseSrt(scriptFileContent) : scriptFileContent;
      } else {
          fullScript = scenario;
      }

      if (!fullScript.trim()) {
          throw new Error("Vui lòng nhập hoặc tải kịch bản.");
      }

      const styleLock = mode === 'prehistoric' ? PREHISTORIC_STYLE : JAPAN_STYLE;
      const aiScenes = await analyzeScriptWithAI(fullScript, activeGoogleKey.key, styleLock, mode);

      const scenes: ScenePrompt[] = aiScenes.map((scene, index) => {
          return {
              id: index + 1,
              phase: scene.phase || "Sequence",
              scriptLine: scene.scriptLine,
              imagePrompt: scene.imagePrompt,
              videoPrompt: scene.videoPrompt
          };
      });

      setPrompts(scenes);
    } catch (err) {
      setError(`Lỗi AI: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`);
    } finally {
      setIsBuilding(false);
    }
  }, [mode, referenceImages, scenario, scriptFileContent, scriptFileName, apiKeys, downloadPromptsAsXLSX]);

  const handleGenerateImage = useCallback(async (sceneId: number) => {
    const promptToGenerate = prompts.find(p => p.id === sceneId);
    if (!promptToGenerate) return;
    const activeGoogleKey = apiKeys.find(k => k.provider === 'Google' && k.isActive);
    if (!activeGoogleKey) {
        setError("Cần API Key Google.");
        setIsModalOpen(true);
        return;
    }
    setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, isLoading: true } : p));
    try {
        const imageUrl = await generateImageFromPrompt(promptToGenerate.imagePrompt, mode === 'prehistoric' ? referenceImages : [], activeGoogleKey.key, selectedModel, true);
        setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, generatedImageUrl: imageUrl, isLoading: false } : p));
    } catch (err) {
        setError(`Lỗi tạo ảnh Scene ${sceneId}: ${err instanceof Error ? err.message : 'Unknown'}`);
        setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, isLoading: false } : p));
    }
  }, [prompts, referenceImages, apiKeys, selectedModel, mode]);

  const handleGenerateAudio = useCallback(async (sceneId: number) => {
      const promptToGenerate = prompts.find(p => p.id === sceneId);
      if (!promptToGenerate) return;
      const activeGoogleKey = apiKeys.find(k => k.provider === 'Google' && k.isActive);
      if (!activeGoogleKey) {
          setError("Cần API Key Google.");
          setIsModalOpen(true);
          return;
      }

      setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, isAudioLoading: true } : p));
      try {
          // Sử dụng scriptLine để tạo voice
          const audioUrl = await generateSpeechFromText(promptToGenerate.scriptLine, activeGoogleKey.key, selectedVoice);
          setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, audioUrl: audioUrl, isAudioLoading: false } : p));
      } catch (err) {
          setError(`Lỗi tạo giọng đọc Scene ${sceneId}: ${err instanceof Error ? err.message : 'Unknown'}`);
          setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, isAudioLoading: false } : p));
      }
  }, [prompts, apiKeys, selectedVoice]);

  const handleGenerateAllImages = useCallback(async () => {
      const activeGoogleKey = apiKeys.find(k => k.provider === 'Google' && k.isActive);
      if (!activeGoogleKey) {
          setError("Cần API Key Google.");
          setIsModalOpen(true);
          return;
      }
      
      setIsGeneratingAll(true);
      const pendingItems = prompts.filter(p => !p.generatedImageUrl);
      
      for (const item of pendingItems) {
         try {
             await handleGenerateImage(item.id);
             await new Promise(r => setTimeout(r, 500));
         } catch (e) { console.error(e); }
      }
      setIsGeneratingAll(false);
  }, [apiKeys, prompts, handleGenerateImage]);

  const handleGenerateAllAudio = useCallback(async () => {
      const activeGoogleKey = apiKeys.find(k => k.provider === 'Google' && k.isActive);
      if (!activeGoogleKey) {
          setError("Cần API Key Google.");
          setIsModalOpen(true);
          return;
      }

      setIsGeneratingAllAudio(true);
      const pendingItems = prompts.filter(p => !p.audioUrl);

      for (const item of pendingItems) {
          try {
              await handleGenerateAudio(item.id);
              await new Promise(r => setTimeout(r, 500));
          } catch (e) { console.error(e); }
      }
      setIsGeneratingAllAudio(false);
  }, [apiKeys, prompts, handleGenerateAudio]);

  const handleDownloadAllImages = useCallback(async () => {
      const imagesToZip = prompts.filter(p => p.generatedImageUrl);
      if (imagesToZip.length === 0) {
          setError("Chưa có ảnh nào được tạo.");
          return;
      }
      
      const zip = new JSZip();
      const timestamp = getTimestamp();
      
      imagesToZip.forEach(p => {
          if (p.generatedImageUrl) {
              const base64Data = p.generatedImageUrl.split(',')[1];
              zip.file(`Scene ${p.id}_Image.png`, base64Data, {base64: true});
          }
      });

      try {
          const content = await zip.generateAsync({type: "blob"});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(content);
          a.download = `storyboard_images_${timestamp}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      } catch (err) {
          setError("Không thể nén và tải ảnh.");
      }
  }, [prompts]);

  const handleDownloadAllAudio = useCallback(async () => {
      const audioToZip = prompts.filter(p => p.audioUrl);
      if (audioToZip.length === 0) {
          setError("Chưa có giọng đọc nào được tạo.");
          return;
      }

      const zip = new JSZip();
      const timestamp = getTimestamp();

      // Fetch blob data from object URLs
      const promises = audioToZip.map(async (p) => {
          if (p.audioUrl) {
              const response = await fetch(p.audioUrl);
              const blob = await response.blob();
              zip.file(`Scene ${p.id}_Audio.wav`, blob);
          }
      });

      try {
          await Promise.all(promises);
          const content = await zip.generateAsync({type: "blob"});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(content);
          a.download = `storyboard_audio_${timestamp}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      } catch (err) {
           setError("Không thể nén và tải âm thanh.");
      }
  }, [prompts]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-6 transition-all duration-300">
      <header className="flex justify-between items-center mb-10 border-b border-slate-800 pb-6 max-w-7xl mx-auto backdrop-blur-sm sticky top-0 z-40 bg-slate-900/80">
        <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-black transition-all transform hover:rotate-6 ${mode === 'japan' ? 'bg-gradient-to-br from-indigo-400 to-rose-400' : 'bg-gradient-to-br from-emerald-400 to-teal-400'}`}>
                {mode === 'japan' ? 'JP' : 'PH'}
            </div>
            <div>
                <h1 className="text-2xl md:text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-rose-400 tracking-tight">
                    AI Storyboard Studio Pro
                </h1>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">ND Media VN - Senior Storyboarding</p>
                </div>
            </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-slate-800/80 hover:bg-slate-700 text-white font-bold py-2.5 px-5 rounded-2xl transition-all flex items-center gap-2 shadow-xl border border-slate-700 hover:scale-105 active:scale-95">
          <KeyIcon className="h-5 w-5 text-emerald-400" />
          <span className="hidden md:inline">Settings</span>
        </button>
      </header>
      
      {error && (
        <div className="max-w-7xl mx-auto bg-red-900/30 border border-red-700/50 text-red-200 px-8 py-5 rounded-3xl mb-10 flex justify-between items-center animate-fade-in shadow-2xl backdrop-blur-md" role="alert">
            <div className="flex items-center gap-4">
                <div className="bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black shadow-lg">!</div>
                <span className="text-sm font-medium leading-relaxed">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-3xl leading-none hover:text-white transition-colors p-2">&times;</button>
        </div>
      )}

      <main className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-4 xl:col-span-3">
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
            onStandardizeScript={handleStandardizeScript}
            isStandardizing={isStandardizing}
            standardizedScript={standardizedScript}
            onDownloadStandardized={handleDownloadStandardizedScript}
          />
        </div>
        <div className="lg:col-span-8 xl:col-span-9">
          <PromptDisplay 
            prompts={prompts} 
            onGenerateImage={handleGenerateImage} 
            onDownloadAllPrompts={() => downloadPromptsAsXLSX(prompts)} 
            onGenerateAll={handleGenerateAllImages}
            onDownloadAllImages={handleDownloadAllImages}
            isGeneratingAll={isGeneratingAll}
            onGenerateAudio={handleGenerateAudio}
            onGenerateAllAudio={handleGenerateAllAudio}
            onDownloadAllAudio={handleDownloadAllAudio}
            isGeneratingAllAudio={isGeneratingAllAudio}
          />
        </div>
      </main>
      
      <ApiKeyModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        apiKeys={apiKeys} 
        onAddKey={handleAddKey} 
        onDeleteKey={handleDeleteKey} 
        onSetActiveKey={handleSetActiveKey} 
        selectedModel={selectedModel} 
        onSelectModel={handleSelectModel}
        selectedVoice={selectedVoice}
        onSelectVoice={handleSelectVoice}
      />
    </div>
  );
}
