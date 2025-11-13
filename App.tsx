
import React, { useState, useRef, useCallback, FC, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { generateImageFromPrompt } from './services/geminiService';

// --- TYPES & CONSTANTS ---
// FIX: Export the ImageFile interface so it can be imported in other files.
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
  generatedImageUrl?: string;
  isLoading?: boolean;
}

interface Phase {
  phase: string;
  ratio: number;
}

const PHASES: Phase[] = [
    { phase: "Hook", ratio: 0.05 },
    { phase: "Quest", ratio: 0.15 },
    { phase: "Conflict", ratio: 0.25 },
    { phase: "Innovation", ratio: 0.25 },
    { phase: "Civilization", ratio: 0.20 },
    { phase: "Reflection", ratio: 0.10 }
];

const STYLE_LOCK = `Ultra-realistic prehistoric ASMR cinematic documentary.\nPrimary character strictly matches 3 uploaded references (face, hair, scars, outfit) to ensure consistency. Supporting characters follow same style but not identity-locked. Lighting: warm amber rimlight + cool fill, fog haze. 45mm lens f/2.0 shallow DOF, film grain subtle, amber-teal tone.`;

const SCENE_DURATION_SECONDS = 8;
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


// --- UI ICONS ---
const UploadIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
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

const SpinnerIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const CloseIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);


// --- CHILD COMPONENTS ---

interface ControlPanelProps {
  scenario: string;
  setScenario: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  referenceImages: ImageFile[];
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBuildPrompts: () => void;
  isBuilding: boolean;
}
const ControlPanel: FC<ControlPanelProps> = ({ scenario, setScenario, duration, setDuration, referenceImages, onImageUpload, onBuildPrompts, isBuilding }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canBuild = useMemo(() => referenceImages.length === MAX_REFERENCE_IMAGES && scenario.trim() !== "" && duration > 0, [referenceImages, scenario, duration]);

  return (
    <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl flex flex-col gap-6 sticky top-6">
      <h2 className="text-xl font-bold text-emerald-400">1. Setup</h2>
      
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">📸 Upload {MAX_REFERENCE_IMAGES} Character Images</label>
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md cursor-pointer hover:border-emerald-500 transition-colors"
        >
          <div className="space-y-1 text-center">
            <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
            <p className="text-sm text-slate-400">Click to upload files</p>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" />
        {referenceImages.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-4">
            {referenceImages.map((img) => (
              <img key={img.name} src={img.dataUrl} alt={img.name} className="rounded-md object-cover aspect-square" />
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="scenario" className="block text-sm font-medium text-slate-300 mb-2">📜 Scenario / Topic</label>
        <textarea
          id="scenario"
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="e.g., A lone hunter tracking a mammoth"
          rows={4}
          className="w-full bg-slate-800 border border-slate-700 p-3 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
        ></textarea>
      </div>

      <div>
        <label htmlFor="duration" className="block text-sm font-medium text-slate-300 mb-2">⏱️ Video Duration (minutes)</label>
        <input
          id="duration"
          type="number"
          min="1"
          value={duration}
          onChange={(e) => setDuration(parseInt(e.target.value, 10))}
          className="w-full bg-slate-800 border border-slate-700 p-3 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
        />
      </div>

      <button
        onClick={onBuildPrompts}
        disabled={!canBuild || isBuilding}
        className="w-full py-3 px-4 rounded-md font-semibold text-black bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed transition-all flex items-center justify-center"
      >
        {isBuilding ? <SpinnerIcon className="animate-spin h-5 w-5 mr-2" /> : null}
        {isBuilding ? 'Generating...' : 'Generate Prompts'}
      </button>
    </div>
  );
};


interface PromptCardProps {
    prompt: ScenePrompt;
    onGenerateImage: (id: number) => void;
}
const PromptCard: FC<PromptCardProps> = ({ prompt, onGenerateImage }) => {
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
        a.download = `scene-${prompt.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="bg-slate-950/30 border border-slate-800 p-4 rounded-xl transition-all hover:border-slate-700">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-emerald-400">Scene {prompt.id}</h3>
                <span className="text-xs font-medium bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{prompt.phase}</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {/* Image Prompt Section */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold text-slate-300">Image Prompt</h4>
                        <button onClick={() => handleCopy(prompt.imagePrompt, 'image')} className="text-slate-400 hover:text-white transition">
                            {copied === 'image' ? 'Copied!' : <CopyIcon className="h-4 w-4" />}
                        </button>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap bg-slate-800/50 p-3 rounded-md font-mono text-slate-400 h-32 overflow-y-auto">{prompt.imagePrompt}</pre>
                </div>
                
                {/* Video Prompt Section */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold text-slate-300">Video Prompt</h4>
                        <button onClick={() => handleCopy(prompt.videoPrompt, 'video')} className="text-slate-400 hover:text-white transition">
                            {copied === 'video' ? 'Copied!' : <CopyIcon className="h-4 w-4" />}
                        </button>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap bg-slate-800/50 p-3 rounded-md font-mono text-slate-400 h-32 overflow-y-auto">{prompt.videoPrompt}</pre>
                </div>
            </div>

            {/* Image Generation */}
            <div className="mt-4 pt-4 border-t border-slate-800">
                {prompt.isLoading ? (
                     <div className="w-full aspect-video bg-slate-800 rounded-lg flex items-center justify-center">
                        <SpinnerIcon className="animate-spin h-8 w-8 text-emerald-500" />
                     </div>
                ) : prompt.generatedImageUrl ? (
                    <div className="relative group">
                      <img src={prompt.generatedImageUrl} alt={`Generated for Scene ${prompt.id}`} className="w-full aspect-video object-cover rounded-lg" />
                      <button 
                        onClick={handleImageDownload} 
                        className="absolute top-2 right-2 bg-black/50 p-2 rounded-full text-white hover:bg-emerald-500/80 transition-all opacity-0 group-hover:opacity-100"
                        aria-label="Download image"
                        title="Download image"
                      >
                          <DownloadIcon className="h-5 w-5"/>
                      </button>
                    </div>
                ) : (
                    <button onClick={() => onGenerateImage(prompt.id)} className="w-full py-2 bg-slate-700 hover:bg-emerald-600 transition-colors rounded-lg text-sm font-semibold">
                        Generate Image
                    </button>
                )}
            </div>
        </div>
    );
};


interface PromptDisplayProps {
    prompts: ScenePrompt[];
    onGenerateImage: (id: number) => void;
    onDownloadAllPrompts: () => void;
}
const PromptDisplay: FC<PromptDisplayProps> = ({ prompts, onGenerateImage, onDownloadAllPrompts }) => {
    if (prompts.length === 0) {
        return (
            <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl flex items-center justify-center min-h-[50vh]">
                <div className="text-center text-slate-500">
                    <h2 className="text-xl font-bold">Prompts will appear here</h2>
                    <p>Complete the setup on the left to generate prompts.</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h2 className="text-xl font-bold text-emerald-400">2. Generated Prompts</h2>
                <div className="flex gap-2">
                    <button onClick={onDownloadAllPrompts} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center gap-2">
                        <DownloadIcon className="h-4 w-4" />
                        Download All Prompts (XLSX)
                    </button>
                </div>
            </div>
             <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-2">
                {prompts.map((p) => (
                    <PromptCard key={p.id} prompt={p} onGenerateImage={onGenerateImage} />
                ))}
             </div>
        </div>
    );
};

interface NotificationPopupProps {
  onClose: () => void;
}

const NotificationPopup: FC<NotificationPopupProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-slate-900 border border-emerald-500/50 p-8 rounded-2xl shadow-lg max-w-md w-full text-center relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors p-1"
          aria-label="Close notification"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
        <h3 className="text-xl font-bold text-emerald-400 mb-4">
          Cập Nhật Kiến Thức
        </h3>
        <p className="text-slate-300 mb-6">
          Đừng quên cập nhập kiến thức và tài liệu tại đây.
        </p>
        <a
          href="https://ndgroupvietnam.net/ndgroup-youtube-1usd-club"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="w-full py-3 px-4 rounded-md font-semibold text-black bg-emerald-500 hover:bg-emerald-400 transition-all inline-block"
        >
          THAM GIA TẠI ĐÂY
        </a>
      </div>
    </div>
  );
};


// --- MAIN APP COMPONENT ---

export default function App() {
  const [scenario, setScenario] = useState("");
  const [duration, setDuration] = useState(15);
  const [referenceImages, setReferenceImages] = useState<ImageFile[]>([]);
  const [prompts, setPrompts] = useState<ScenePrompt[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);

  React.useEffect(() => {
    // This effect runs once on component mount.
    
    // Open the YouTube subscription link in a new tab.
    window.open('https://www.youtube.com/@ndgroupvietnam/?sub_confirmation=1', '_blank', 'noopener,noreferrer');

    // Set up the interval for showing the notification popup.
    const intervalId = setInterval(() => {
        setIsPopupVisible(true);
    }, 50000); // 50 seconds

    // Cleanup the interval when the component unmounts.
    return () => clearInterval(intervalId);
  }, []); // The empty dependency array ensures this runs only once.

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const files = Array.from(e.target.files).slice(0, MAX_REFERENCE_IMAGES);
      if (files.length === 0) return;
      setError(null);

      try {
// FIX: Explicitly type `file` as `File` to resolve typing errors.
          const imagePromises = files.map(async (file: File) => {
              const { dataUrl, mimeType } = await fileToDataUrl(file);
              const base64 = dataUrlToBase64(dataUrl);
              return { name: file.name, dataUrl, base64, mimeType };
          });
          const newImages = await Promise.all(imagePromises);
          setReferenceImages(newImages);
      } catch (err) {
          setError('Failed to read image files.');
          console.error(err);
      }
  }, []);

  const downloadPromptsAsXLSX = useCallback((promptsToDownload: ScenePrompt[]) => {
    if (!promptsToDownload.length) return;

    try {
        const header = ["STT", "Phase", "Image Prompt", "Video Prompt"];
        const data = promptsToDownload.map(p => [p.id, p.phase, p.imagePrompt, p.videoPrompt]);
        
        const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);

        // Set column widths for better readability
        const columnWidths = [
            { wch: 5 },  // STT
            { wch: 15 }, // Phase
            { wch: 80 }, // Image Prompt
            { wch: 80 }, // Video Prompt
        ];
        worksheet['!cols'] = columnWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Prompts");
        XLSX.writeFile(workbook, "all-prompts.xlsx");
    } catch (err) {
        // Silently fail on XLSX generation as requested. The error is logged for developers.
        console.error("Failed to generate XLSX file:", err);
    }
  }, []);

  const handleBuildPrompts = useCallback(() => {
    if (referenceImages.length < MAX_REFERENCE_IMAGES) {
      setError(`Please upload exactly ${MAX_REFERENCE_IMAGES} character images.`);
      return;
    }
    setIsBuilding(true);
    setError(null);

    setTimeout(() => {
      const totalSec = duration * 60;
      const scenes: ScenePrompt[] = [];
      let id = 1;
      const baseScenario = scenario || "prehistoric survival";

      const generateActionDescription = (phase: string, index: number, totalInPhase: number, baseScenario: string): string => {
        const progress = totalInPhase > 1 ? `(part ${index + 1} of ${totalInPhase})` : '';
        
        switch(phase) {
            case "Hook":
                return `Establishing the main character and their immediate environment, related to the topic of ${baseScenario}. The character is observing their surroundings with a thoughtful expression. ${progress}`;
            case "Quest":
                if (index === 0) return `The character begins a journey with purpose, moving through the landscape. This is the start of a task related to ${baseScenario}. ${progress}`;
                if (index === totalInPhase - 1) return `The character is nearing their goal, showing a mix of fatigue and focus. The quest for ${baseScenario} is almost complete. ${progress}`;
                return `The character navigates a challenging part of the terrain (e.g., crossing a shallow river, climbing a rocky outcrop) as they continue their quest for ${baseScenario}. ${progress}`;
            case "Conflict":
                if (index < Math.floor(totalInPhase / 2)) return `Tension builds. The character detects a sign of danger or the initial stage of a challenge related to ${baseScenario}. They are cautious and alert. ${progress}`;
                return `The height of the conflict. The character is actively engaged with the main challenge (e.g., facing a predator, enduring a harsh storm) in their story about ${baseScenario}. ${progress}`;
            case "Innovation":
                if (index === 0) return `The character struggles with an old method, a look of frustration hints at the need for a new solution. This is related to ${baseScenario}. ${progress}`;
                if (index < totalInPhase - 1) return `Deep in concentration, the character experiments with new materials, crafting a new tool or perfecting a new technique. Focus on the hands-on process of innovation for ${baseScenario}. ${progress}`;
                return `Success! The character uses their new tool or discovery for the first time, with a clear look of accomplishment. This is a breakthrough in their story of ${baseScenario}. ${progress}`;
            case "Civilization":
                 if (index < Math.floor(totalInPhase / 2)) return `The focus is on building and community. The character improves their shelter or works alongside others on a task, showing early signs of a settled life, related to ${baseScenario}. ${progress}`;
                return `A slice of daily life. The character is using improved tools to prepare food, or sharing a quiet moment with their small community, showing the stability they have achieved through ${baseScenario}. ${progress}`;
            case "Reflection":
                return `A quiet, concluding moment. The character looks out at the landscape from a high vantage point, reflecting on their journey and the events of ${baseScenario}. ${progress}`;
            default:
                return `A scene from the story of ${baseScenario}. ${progress}`;
        }
    }

      PHASES.forEach((p) => {
        const numScenesInPhase = Math.max(1, Math.round((totalSec * p.ratio) / SCENE_DURATION_SECONDS));
        for (let i = 0; i < numScenesInPhase; i++) {
          const actionDescription = generateActionDescription(p.phase, i, numScenesInPhase, baseScenario);

          const imagePrompt = `${STYLE_LOCK}\nScene ${id} (${p.phase}): ${actionDescription}. Distinct moment in the story. Tactile ASMR details (stone flaking, fire crackling). Photorealistic. No text, words, or logos.`;
          
          const videoPrompt = `Animate the image from Scene ${id}. Action: "${actionDescription}". Direct continuation of the still image, bringing it to life with subtle motion. Handheld camera (3-5% sway), focus breathing. Prehistoric ambient sounds only. Duration ${SCENE_DURATION_SECONDS}s. Family safe for monetization.`;
          
          scenes.push({ id, phase: p.phase, imagePrompt, videoPrompt });
          id++;
        }
      });
      setPrompts(scenes);
      downloadPromptsAsXLSX(scenes);
      setIsBuilding(false);
    }, 500);
  }, [referenceImages.length, duration, scenario, downloadPromptsAsXLSX]);

  const handleGenerateImage = useCallback(async (sceneId: number) => {
    const promptToGenerate = prompts.find(p => p.id === sceneId);
    if (!promptToGenerate) return;

    setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, isLoading: true } : p));
    setError(null);

    try {
        const imageUrl = await generateImageFromPrompt(promptToGenerate.imagePrompt, referenceImages);
        setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, generatedImageUrl: imageUrl, isLoading: false } : p));
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
        setError(`Error for Scene ${sceneId}: ${errorMessage}`);
        setPrompts(prev => prev.map(p => p.id === sceneId ? { ...p, isLoading: false } : p));
    }
  }, [prompts, referenceImages]);

  const handleDownloadAllPrompts = useCallback(() => {
    downloadPromptsAsXLSX(prompts);
  }, [prompts, downloadPromptsAsXLSX]);

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6">
      <header className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">
          NDGroup Media Việt Nam - Tool Tự Động Hóa Chủ Đề Người Tiền Sử
        </h1>
      </header>
      
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-6" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
        </div>
      )}

      <main className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1">
          <ControlPanel
            scenario={scenario}
            setScenario={setScenario}
            duration={duration}
            setDuration={setDuration}
            referenceImages={referenceImages}
            onImageUpload={handleImageUpload}
            onBuildPrompts={handleBuildPrompts}
            isBuilding={isBuilding}
          />
        </div>

        <div className="lg:col-span-2">
          <PromptDisplay 
            prompts={prompts} 
            onGenerateImage={handleGenerateImage}
            onDownloadAllPrompts={handleDownloadAllPrompts}
          />
        </div>
      </main>

      {isPopupVisible && <NotificationPopup onClose={() => setIsPopupVisible(false)} />}
    </div>
  );
}
