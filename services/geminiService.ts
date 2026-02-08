
import { GoogleGenAI, Modality } from "@google/genai";
import { ImageFile } from '../App';

export const generateImageFromPrompt = async (prompt: string, referenceImages: ImageFile[], apiKey: string, model: string, forceAspectRatio169: boolean = false): Promise<string> => {
  try {
    if (!apiKey) {
        throw new Error("API key is missing.");
    }
    const ai = new GoogleGenAI({ apiKey });
    
    // Convert reference images to inlineData parts if they exist
    const imageParts = referenceImages.map(img => ({
      inlineData: {
        data: img.base64,
        mimeType: img.mimeType,
      }
    }));

    const textPart = { text: prompt };

    // Nano Banana / Gemini 2.5 Flash Image models support imageConfig for aspect ratio
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [...imageParts, textPart]
      },
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          aspectRatio: forceAspectRatio169 ? "16:9" : "1:1"
        }
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData) {
        const base64ImageBytes: string = part.inlineData.data;
        const mimeType = part.inlineData.mimeType;
        return `data:${mimeType};base64,${base64ImageBytes}`;
      }
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    throw new Error(finishReason ? `Generation stopped: ${finishReason}` : "No image returned.");

  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error(error instanceof Error ? error.message : "Image generation failed.");
  }
};
