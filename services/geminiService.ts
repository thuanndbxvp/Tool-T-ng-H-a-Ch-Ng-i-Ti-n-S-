
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { ImageFile } from '../App';

export const analyzeScriptWithAI = async (script: string, apiKey: string, styleLock: string, mode: string): Promise<any[]> => {
  if (!apiKey) throw new Error("Vui lòng cấu hình API Key Google.");
  
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `You are a professional storyboard artist and script analyst. 
Target Audience: Elderly women over 60 years old. 
Story Tone: Nostalgic, gentle, slightly melancholic ("u buồn"), deeply emotional, focused on memories and everyday life. 

CRITICAL VISUAL RULES:
1. **Consistency**: You must use the EXACT SAME Style Keywords provided in "Integration" below for EVERY image prompt.
2. **Structure**: Every image prompt must start with the Style definition, followed by the Character description, then the Action/Scene.
3. **Granularity**: Create a separate visual scene for EVERY SINGLE SENTENCE. Do not group sentences.

Your Task: Analyze the provided script and break it down.

For each scene, provide:
1. "scriptLine": The specific sentence or phrase from the script.
2. "phase": The story phase.
3. "imagePrompt": A highly detailed visual prompt.
   - **Integration (MANDATORY)**: You MUST begin the prompt with this text: "${styleLock}"
   - **Content**: Describe the scene action based on the script line.
   - **Lighting/Atmosphere**: Ensure it matches the requested style (e.g., soft amber for Japan, dramatic for Prehistoric).
4. "videoPrompt": Instructions for cinematic, slow-paced camera movements.

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
