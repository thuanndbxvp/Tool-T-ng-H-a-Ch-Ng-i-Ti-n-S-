
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { ImageFile } from '../App';

export const standardizeScriptWithAI = async (script: string, apiKey: string): Promise<string> => {
  if (!apiKey) throw new Error("Vui lòng cấu hình API Key Google.");

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are an expert TTS (Text-to-Speech) script editor.
Your task: Clean and optimize the provided script for natural speech reading (Audiobook/Narration style).

RULES:
1. **Remove Non-Spoken Elements**: Delete visual descriptions, scene headers (e.g., "Scene 1", "EXT. DAY"), camera directions, and markdown formatting (like **bold**, *italics*, [brackets]).
2. **Punctuation**: Optimize punctuation for natural pausing. Remove excessive dots (...) or dashes (-) unless they indicate a necessary pause.
3. **Format Preservation (CRITICAL)**:
   - If the input is **SRT format** (contains timestamps like 00:00:01,000 --> ...): You MUST PRESERVE the exact SRT structure (Sequence Number -> Timestamp -> Text). ONLY edit the dialogue text. Do NOT merge lines or change timestamps.
   - If the input is **Plain Text**: Remove line breaks within sentences to create full paragraphs, but keep line breaks between distinct dialogue or narration blocks.
4. **Content**: Do not change the meaning. Only remove "noise" that shouldn't be read aloud (e.g., "Chapter 1", "Part A").

Output only the raw cleaned text/srt. Do not wrap in markdown code blocks.`;

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
