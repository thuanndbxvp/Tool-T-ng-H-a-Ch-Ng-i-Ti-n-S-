
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

    const finishReason = response.candidates?.[0]?.finishReason;
    let userFriendlyError = "No image was generated in the response. The model may have refused to generate the image.";

    if (finishReason) {
        switch (finishReason) {
            case 'NO_IMAGE':
                userFriendlyError = "The model did not generate an image for this prompt, possibly due to safety policies or prompt clarity. Please try regenerating.";
                break;
            case 'SAFETY':
                 userFriendlyError = "Image generation was blocked due to safety policies. Please try a different prompt.";
                 break;
            default:
                userFriendlyError = `Image generation failed: ${finishReason}`;
        }
    }
    throw new Error(userFriendlyError);

  } catch (error) {
    console.error("Error generating image with Gemini:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during image generation.";
    throw new Error(errorMessage);
  }
};
