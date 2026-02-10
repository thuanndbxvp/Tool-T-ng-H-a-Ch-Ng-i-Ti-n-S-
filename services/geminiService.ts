
import { GoogleGenAI, Type } from "@google/genai";

export const standardizeScriptWithAI = async (script: string, apiKey: string, modelName: string = "gemini-3-flash-preview"): Promise<string> => {
  if (!apiKey) throw new Error("Vui lòng cấu hình API Key Google.");

  const ai = new GoogleGenAI({ apiKey });

  // System Instruction được cập nhật để đảm bảo tính toàn vẹn nội dung
  const systemInstruction = `You are a strict text cleaning engine.
Your GOAL: Remove non-spoken formatting and metadata without changing a single spoken word.

STRICT RULES:
1. **NO REWRITING**: Do NOT change words, fix grammar, summarize, or alter the sentence structure. Keep the spoken content 100% original.
2. **REMOVE NOISE**: 
   - Remove Stage Directions/Visual Cues (e.g., [Laughs], (Sighs), Scene 1, EXT. DAY).
   - Remove Markdown (**bold**, *italics*, etc.) and excessive separators.
3. **PRESERVE SRT STRUCTURE**:
   - If input is SRT, keep timestamps and sequence numbers exactly as is. Only clean the text part.
4. **FORMATTING**:
   - Remove extra line breaks within a single sentence (join broken lines).
   - Keep line breaks between distinct paragraphs or dialogue lines.

Output ONLY the cleaned text.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName, // Use selected model
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

export const analyzeScriptWithAI = async (
    script: string,
    referenceImages: { base64: string; mimeType: string }[],
    apiKey: string, 
    styleLock: string, 
    mode: string,
    segmentationMode: 'ai' | 'punctuation',
    modelName: string = "gemini-3-pro-preview"
): Promise<any[]> => {
  if (!apiKey) throw new Error("Vui lòng cấu hình API Key Google.");
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Construct Segmentation Instruction based on mode
  let segmentationInstruction = "";
  if (segmentationMode === 'ai') {
      segmentationInstruction = `**TASK 2: SEGMENTATION (STRICT & CRITICAL - AI MODE)**
Do NOT simply split by sentences or punctuation. Use **Semantic Segmentation**.
- **Rule 1 (Length)**: Break the script into short segments/lines of approximately **7-15 words**. This is optimized for visual pacing.
- **Rule 2 (Semantic Integrity)**: Do NOT cut in the middle of a thought or content just to meet the word count. Each segment must be a complete logical thought, phrase, or meaningful unit.
- **Rule 3 (Fidelity)**: STRICTLY **do not add, remove, or translate ANY words** from the original script. The combined output of "scriptLine" fields must equal the input text exactly.
- **Rule 4 (Format)**: Each segmented line corresponds to one item (one Scene) in the JSON output array.`;
  } else {
      segmentationInstruction = `**TASK 2: SEGMENTATION (STRICT & CRITICAL - PUNCTUATION MODE)**
Split the script strictly based on sentence-ending punctuation marks (., ?, !, ...).
- **Rule 1 (Punctuation)**: Start a new segment after every sentence-ending punctuation mark. If a sentence is extremely long (>50 words), you may split at a major clause (comma/semicolon) to keep prompts manageable.
- **Rule 2 (Fidelity)**: STRICTLY **do not add, remove, or translate ANY words** from the original script. The combined output of "scriptLine" fields must equal the input text exactly.
- **Rule 3 (Format)**: Each segmented line corresponds to one item (one Scene) in the JSON output array.`;
  }
  
  // Updated System Instruction
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

${segmentationInstruction}

**TASK 3: PROMPT GENERATION**
For each segmented line (Scene), generate a JSON object with:
1. "scriptLine": The exact segmented text line from the script based on the rules above.
2. "phase": The narrative phase (e.g., "Introduction", "Climax").
3. "imagePrompt": A self-contained, highly detailed visual description.
   - **STYLE INJECTION**: Analyze the attached Reference Images (if any). Extract their art style (e.g., color palette, lighting key, texture, rendering style) and WRITE IT EXPLICITLY into the prompt description.
   - **MANDATORY PREFIX**: Start exactly with: "${styleLock}"
   - **CHARACTER BLOCK (REDUNDANT)**: You MUST explicitly describe the characters' appearance in EVERY SINGLE PROMPT. Do not assume the AI remembers from the previous prompt.
     - *Bad*: "He hands her a cup."
     - *Good*: "An elderly Japanese man (75, gray hair, reading glasses, sweater) hands a ceramic cup to an elderly Japanese woman (70, gray hair bun, apron)."
   - **ACTION BLOCK**: Visualize the specific action in the sentence.
   - **MOOD BLOCK**: Lighting (e.g., sunset, warm lamp) and atmosphere.
4. "videoPrompt": Slow, cinematic camera movement instructions (e.g., "Slow push in", "Static shot with wind movement").

OUTPUT ONLY A JSON ARRAY.`;

  // --- CONSTRUCT MULTIMODAL CONTENT ---
  const parts: any[] = [];
  
  // 1. Add Reference Images
  if (referenceImages && referenceImages.length > 0) {
      referenceImages.forEach(img => {
          parts.push({
              inlineData: {
                  mimeType: img.mimeType,
                  data: img.base64
              }
          });
      });
      // Add a text cue for the images
      parts.push({ text: "REFER TO THE ABOVE IMAGES FOR VISUAL STYLE (Color, Lighting, Texture)." });
  }

  // 2. Add The Script
  parts.push({ text: script });

  try {
    const response = await ai.models.generateContent({
      model: modelName, // Use selected model
      contents: { parts }, // Send both images and text
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
    throw new Error(`Không thể phân tích kịch bản với ${modelName}. Vui lòng kiểm tra API Key.`);
  }
};
