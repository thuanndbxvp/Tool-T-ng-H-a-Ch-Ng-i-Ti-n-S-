
import { GoogleGenAI, Type } from "@google/genai";

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
    try {
        const ai = new GoogleGenAI({ apiKey });
        // Gọi một request siêu nhẹ để test key
        await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'ping',
        });
        return true;
    } catch (error) {
        console.error("Key Validation Failed:", error);
        return false;
    }
};

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
    segmentationMode: 'ai' | 'punctuation' | 'fixed',
    modelName: string = "gemini-3-flash-preview",
    targetSceneCount: number = 10,
    promptType: 'image' | 'video' = 'image',
    aspectRatio: string = '16:9'
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
  } else if (segmentationMode === 'punctuation') {
      segmentationInstruction = `**TASK 2: SEGMENTATION (STRICT & CRITICAL - PUNCTUATION MODE)**
Split the script strictly based on sentence-ending punctuation marks (., ?, !, ...).
- **Rule 1 (Punctuation)**: Start a new segment after every sentence-ending punctuation mark. If a sentence is extremely long (>50 words), you may split at a major clause (comma/semicolon) to keep prompts manageable.
- **Rule 2 (Fidelity)**: STRICTLY **do not add, remove, or translate ANY words** from the original script. The combined output of "scriptLine" fields must equal the input text exactly.
- **Rule 3 (Format)**: Each segmented line corresponds to one item (one Scene) in the JSON output array.`;
  } else if (segmentationMode === 'fixed') {
      const tolerance = targetSceneCount > 50 ? "±5%" : "exact";
      segmentationInstruction = `**TASK 2: SEGMENTATION (STRICT & CRITICAL - FIXED COUNT MODE)**
Target Scene Count: **${targetSceneCount}** (Tolerance: ${tolerance}).

STRATEGY TO ACHIEVE TARGET:
1. **Analyze Density**: First, estimate the total content of the script. Calculate roughly how much text should be in each scene to reach ${targetSceneCount} scenes.
   - *Strategy*: If the script is long and the target count is high, you MUST split frequently (e.g., every sentence or even every major clause). Do not group sentences unless necessary.
   - *Strategy*: If the script is short and the target is low, group sentences together.
2. **Distribute Evenly**: Do not bunch up segments at the beginning. Maintain a consistent pacing throughout to reach the end of the script exactly around scene #${targetSceneCount}.
3. **Semantic Priority**: While aiming for the target count, NEVER break a sentence in a way that destroys meaning. It is better to be off by a few scenes (within 5%) than to have broken gibberish.
4. **Count Check**: Continuously track your scene count as you generate.

- **Rule 1 (Target)**: Aim for exactly ${targetSceneCount} items in the JSON array. For large counts (>100), a deviation of ±5% is acceptable to preserve semantic integrity.
- **Rule 2 (Fidelity)**: STRICTLY **do not add, remove, or translate ANY words** from the original script.
- **Rule 3 (Format)**: Each segmented line corresponds to one item (one Scene).`;
  }

  // Construct Prompt Type Instruction
  let promptGenerationInstruction = "";
  const commonStyleInjection = `   - **STYLE INJECTION**: Analyze the attached Reference Images (if any). Extract their art style (e.g., color palette, lighting key, texture, rendering style) and WRITE IT EXPLICITLY into the prompt description.
   - **MANDATORY PREFIX**: Start exactly with: "${styleLock}"`;

  if (promptType === 'image') {
      promptGenerationInstruction = `3. "imagePrompt": A self-contained, highly detailed visual description for a static image, optimized for Google Nano Banana (Gemini Image Models).
${commonStyleInjection}
   - **NO PARAMETERS**: Do not use Midjourney parameters (like --v 6.0, --ar 16:9). Use natural, descriptive English only.
   - **ASPECT RATIO**: Output MUST include the aspect ratio parameter "--ar ${aspectRatio}" at the very end of the prompt.
   - **CHARACTER CONSISTENCY**: Analyze the script to identify the main characters. Describe their appearance consistently in EVERY SINGLE PROMPT (Age, Gender, Ethnicity, Hair, Clothing, key features) based on the script's context.
   - **VISUAL FIDELITY**: Focus on soft lighting, rich textures, and a clean composition suitable for the "Nano Banana" model (high adherence to prompt).
   - **ACTION & MOOD**: Describe the scene action and atmosphere vividly based on the script context.`;
  } else {
      let videoRatioDesc = "Widescreen cinematic";
      if (aspectRatio === '9:16') videoRatioDesc = "Vertical full-screen mobile";
      if (aspectRatio === '1:1') videoRatioDesc = "Square format";

      promptGenerationInstruction = `3. "videoPrompt": A highly detailed video generation prompt optimized for Google Veo 3 (approx 8 seconds).
${commonStyleInjection}
   - **ASPECT RATIO & FRAMING**: Composition must be ${videoRatioDesc} (${aspectRatio}). Frame the subject accordingly.
   - **VISUAL NARRATIVE**: Describe the continuous motion, physics, and changes within the 8s clip.
   - **CAMERA & CINEMATOGRAPHY**: Specify camera movement (e.g., "Slow tracking shot", "Drone view", "Static camera with subtle subject motion", "Rack focus").
   - **CHARACTER & ACTION**: Describe fluid movements based on the script. Ensure characters appearance is described fully and consistently with the script's era/setting.
   - **ATMOSPHERE**: Describe how light interacts with motion (e.g., "Dust motes dancing in light", "Hair blowing in wind", "Explosions", "Smoke").`;
  }
  
  // Updated System Instruction - REMOVED HARDCODED BIAS
  const systemInstruction = `You are a professional storyboard artist and script analyst. 

**TASK 1: CONTEXT & LOGIC ANALYSIS (CRITICAL)**
- **Analyze the Script**: Determine the setting, time period, atmosphere, and characters based STRICTLY on the provided text.
- **Character Consistency**: Identify the main characters from the text and maintain their visual consistency (Age, Gender, Ethnicity, Clothing) throughout the prompts.
- **Setting**: Use the location and era described in the script (e.g., WWII Europe, Modern City, Fantasy World). Do NOT hallucinate a specific setting (like Japan/Tatami) unless it is in the script.
- **Tone**: Adapt the visual tone to match the script (e.g., if the script is action-packed, use dynamic angles; if sad, use moody lighting).

${segmentationInstruction}

**TASK 3: PROMPT GENERATION**
For each segmented line (Scene), generate a JSON object with:
1. "scriptLine": The exact segmented text line from the script based on the rules above.
2. "phase": The narrative phase (e.g., "Introduction", "Climax", "Action", "Dialogue").
${promptGenerationInstruction}

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

  // Define Schema based on prompt type
  const schemaProperties: any = {
      scriptLine: { type: Type.STRING },
      phase: { type: Type.STRING },
  };
  const requiredFields = ["scriptLine", "phase"];

  if (promptType === 'image') {
      schemaProperties.imagePrompt = { type: Type.STRING };
      requiredFields.push("imagePrompt");
  } else {
      schemaProperties.videoPrompt = { type: Type.STRING };
      requiredFields.push("videoPrompt");
  }

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
                properties: schemaProperties,
                required: requiredFields
            }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI không phản hồi kịch bản.");
    
    return JSON.parse(text.trim());
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw new Error(`Không thể phân tích kịch bản với ${modelName}. Lỗi: ${error.message || error}`);
  }
};
