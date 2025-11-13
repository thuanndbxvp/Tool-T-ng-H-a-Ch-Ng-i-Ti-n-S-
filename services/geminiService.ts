
import { GoogleGenAI, Modality } from "@google/genai";
import { ImageFile } from '../App'; // Assuming types are exported from App.tsx

export const generateImageFromPrompt = async (prompt: string, referenceImages: ImageFile[], apiKey: string, model: string): Promise<string> => {
  try {
    if (!apiKey) {
        throw new Error("API key is missing.");
    }
    // Initialize with the provided API key
    const ai = new GoogleGenAI({ apiKey });
    
    const imageParts = referenceImages.map(img => ({
      inlineData: {
        data: img.base64,
        mimeType: img.mimeType,
      }
    }));

    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model, // Use the provided model
      contents: {
        parts: [...imageParts, textPart]
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData) {
        const base64ImageBytes: string = part.inlineData.data;
        const mimeType = part.inlineData.mimeType;
        return `data:${mimeType};base64,${base64ImageBytes}`;
      }
    }

    const fallbackError = response.candidates?.[0]?.finishReason;
    throw new Error(fallbackError ? `Image generation failed: ${fallbackError}` : "No image was generated in the response.");

  } catch (error) {
    console.error("Error generating image with Gemini:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during image generation.";
    throw new Error(errorMessage);
  }
};
