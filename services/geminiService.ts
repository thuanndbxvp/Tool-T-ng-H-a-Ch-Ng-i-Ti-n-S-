
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { ImageFile } from '../App';

// Helper: Chuyển đổi Raw PCM (Int16) sang WAV file (có header) để trình duyệt có thể phát
const pcmToWav = (pcmData: Int16Array, sampleRate: number = 24000): Blob => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length * 2; // 2 bytes per sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    view.setInt16(offset, pcmData[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const decodeBase64ToInt16Array = (base64: string): Int16Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // Convert Uint8Array (bytes) to Int16Array (PCM 16-bit)
  return new Int16Array(bytes.buffer);
};


export const generateSpeechFromText = async (text: string, apiKey: string, voiceName: string = 'Kore'): Promise<string> => {
  if (!apiKey) throw new Error("Vui lòng cấu hình API Key Google.");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: text }]
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("Không nhận được phản hồi âm thanh.");

    let base64Audio = "";
    
    for (const part of candidate.content.parts) {
      if (part.inlineData && part.inlineData.data) {
        base64Audio = part.inlineData.data;
        break;
      }
    }

    if (!base64Audio) throw new Error("Không tìm thấy dữ liệu âm thanh.");

    // Convert raw PCM base64 to WAV Blob URL
    const pcmData = decodeBase64ToInt16Array(base64Audio);
    // Gemini TTS usually outputs 24000Hz
    const wavBlob = pcmToWav(pcmData, 24000); 
    
    return URL.createObjectURL(wavBlob);

  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw new Error(error instanceof Error ? error.message : "Lỗi tạo giọng đọc.");
  }
};

export const standardizeScriptWithAI = async (script: string, apiKey: string): Promise<string> => {
  if (!apiKey) throw new Error("Vui lòng cấu hình API Key Google.");

  const ai = new GoogleGenAI({ apiKey });

  // System Instruction được cập nhật để đảm bảo tính toàn vẹn nội dung
  const systemInstruction = `You are a strict text cleaning engine for Text-to-Speech (TTS) preparation.
Your GOAL: Remove non-spoken formatting and metadata without changing a single spoken word.

STRICT RULES:
1. **NO REWRITING**: Do NOT change words, fix grammar, summarize, or alter the sentence structure. Keep the spoken content 100% original.
2. **REMOVE NOISE**: 
   - Remove Markdown (**bold**, *italics*, etc.).
   - Remove Stage Directions/Visual Cues (e.g., [Laughs], (Sighs), Scene 1, EXT. DAY).
   - Remove excessive underscores (____) or separators (---).
3. **PRESERVE SRT STRUCTURE**:
   - If input is SRT, keep timestamps and sequence numbers exactly as is. Only clean the text part.
4. **FORMATTING**:
   - Remove extra line breaks within a single sentence (join broken lines).
   - Keep line breaks between distinct paragraphs or dialogue lines.

Output ONLY the cleaned text.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: script,
      config: {
        systemInstruction,
        // No JSON schema here, we want raw text/srt output
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI không phản hồi.");
    
    return text.trim();
  } catch (error) {
    console.error("Standardize Script Error:", error);
    throw new Error("Không thể chuẩn hóa kịch bản. Vui lòng thử lại.");
  }
};

export const analyzeScriptWithAI = async (script: string, apiKey: string, styleLock: string, mode: string): Promise<any[]> => {
  if (!apiKey) throw new Error("Vui lòng cấu hình API Key Google.");
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Updated System Instruction: Logic tuổi tác, Tách câu 1-1, và Mô tả lặp lại.
  const systemInstruction = `You are a professional storyboard artist and script analyst. 
Target Audience: Elderly women over 60 years old. 
Story Tone: Nostalgic, gentle, slightly melancholic ("u buồn"), deeply emotional, focused on memories and everyday life. 

**TASK 1: CONTEXT & LOGIC ANALYSIS (CRITICAL)**
- Read the ENTIRE text provided first to understand character relationships.
- **Logical Aging**: Apply real-world logic to characters relationships.
  - **Protagonist**: Elderly woman (70s).
  - **Husband/Partner**: If present, MUST be an elderly man (~75 years old, gray hair, wrinkles) to match the wife. NEVER depict a young husband unless explicitly stated as a "Flashback".
  - **Children**: Middle-aged (40s-50s).
  - **Grandchildren**: Children (5s-10s).
- **Environment**: Maintain a consistent setting (e.g., old traditional house, tatami mats) unless the scene changes.

**TASK 2: SEGMENTATION**
- **Granularity**: Split the script EXACTLY by sentences. **1 Sentence = 1 Image Prompt**.
- If a sentence is very long, break it into 2 logical visual beats.
- Ensure the number of generated prompts matches the narrative flow of the text.

**TASK 3: PROMPT GENERATION**
For each scene, generate a JSON object with:
1. "scriptLine": The exact sentence from the script.
2. "phase": The narrative phase (e.g., "Introduction", "Climax").
3. "imagePrompt": A self-contained, highly detailed visual description.
   - **MANDATORY PREFIX**: Start exactly with: "${styleLock}"
   - **CHARACTER BLOCK (REDUNDANT)**: You MUST explicitly describe the characters' appearance in EVERY SINGLE PROMPT. Do not assume the AI remembers from the previous prompt.
     - *Bad*: "He hands her a cup."
     - *Good*: "An elderly Japanese man (75, gray hair, reading glasses, sweater) hands a ceramic cup to an elderly Japanese woman (70, gray hair bun, apron)."
   - **ACTION BLOCK**: Visualize the specific action in the sentence.
   - **MOOD BLOCK**: Lighting (e.g., sunset, warm lamp) and atmosphere.
4. "videoPrompt": Slow, cinematic camera movement instructions (e.g., "Slow push in", "Static shot with wind movement").

OUTPUT ONLY A JSON ARRAY.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: script,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    scriptLine: { type: Type.STRING },
                    phase: { type: Type.STRING },
                    imagePrompt: { type: Type.STRING },
                    videoPrompt: { type: Type.STRING },
                },
                required: ["scriptLine", "phase", "imagePrompt", "videoPrompt"]
            }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI không phản hồi kịch bản.");
    
    return JSON.parse(text.trim());
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw new Error("Không thể phân tích kịch bản với Gemini 3 Pro. Vui lòng kiểm tra API Key.");
  }
};

export const generateImageFromPrompt = async (prompt: string, referenceImages: ImageFile[], apiKey: string, model: string, forceAspectRatio169: boolean = true): Promise<string> => {
  if (!apiKey) throw new Error("Vui lòng cấu hình API Key Google.");
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const imageParts = referenceImages.map(img => ({
      inlineData: {
        data: img.base64,
        mimeType: img.mimeType,
      }
    }));

    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: model || 'gemini-3-pro-image-preview',
      contents: {
        parts: [...imageParts, textPart]
      },
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          aspectRatio: forceAspectRatio169 ? "16:9" : "1:1",
          imageSize: "1K"
        }
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("Không nhận được kết quả từ AI.");

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        const base64ImageBytes: string = part.inlineData.data;
        const mimeType = part.inlineData.mimeType;
        return `data:${mimeType};base64,${base64ImageBytes}`;
      }
    }

    throw new Error(candidate.finishReason ? `AI từ chối tạo: ${candidate.finishReason}` : "Không có dữ liệu ảnh.");

  } catch (error) {
    console.error("Gemini Image Error:", error);
    throw new Error(error instanceof Error ? error.message : "Lỗi tạo ảnh.");
  }
};
