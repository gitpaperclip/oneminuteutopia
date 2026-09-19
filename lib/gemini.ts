import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface AnalysisResult {
  category: 'litter' | 'path_obstruction' | 'road_damage' | 'other';
  short_label: string;
  full_description: string;
  confidence: number;
  possible_hazard: boolean;
  community_action_candidate: boolean;
  routing_suggestion: string;
}

const ANALYSIS_TIMEOUT = 8000; // 8 seconds as per plan

export class GeminiService {
  static async analyzeImage(imageBuffer: Buffer, mimeType: string): Promise<AnalysisResult | null> {
    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      });

      const base64Data = imageBuffer.toString('base64');

      const prompt = `Analyze this image of a potential civic infrastructure or public space issue. 
You must respond with valid JSON matching this exact structure:

{
  "category": "litter" | "path_obstruction" | "road_damage" | "other",
  "short_label": "Brief 5-8 word description of what is visible",
  "full_description": "Detailed 2-3 sentence description of observable facts only",
  "confidence": 0.0 to 1.0,
  "possible_hazard": true or false,
  "community_action_candidate": true or false,
  "routing_suggestion": "municipal_works" | "community_cleanup" | "accessibility_review" | "manual_review"
}

Categories:
- litter: trash, debris, scattered waste
- path_obstruction: blocked sidewalk, bike path, or pedestrian access
- road_damage: potholes, cracks, damaged pavement
- other: issues that don't fit above categories

Important rules:
- ONLY describe what is VISIBLE in the image
- Do NOT infer location, time, or context beyond what's shown
- Do NOT claim electrical wires are live or dangerous without clear evidence
- Do NOT state that authorities have been notified
- Set confidence based on image clarity and category certainty
- possible_hazard should be true only for clear safety concerns
- community_action_candidate should be true for simple cleanup tasks (litter, minor obstructions)

If the image doesn't show a clear civic issue, use category "other" and explain what is visible.`;

      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => resolve(null), ANALYSIS_TIMEOUT)
      );

      const analysisPromise = model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType,
          },
        },
      ]).then(result => {
        const text = result.response.text();
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        
        // Validate required fields
        if (!parsed.category || !parsed.short_label || !parsed.full_description) {
          throw new Error('Missing required fields in AI response');
        }

        // Ensure confidence is between 0 and 1
        parsed.confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

        return parsed as AnalysisResult;
      });

      const result = await Promise.race([analysisPromise, timeoutPromise]);
      
      if (!result) {
        console.warn('Gemini analysis timed out after', ANALYSIS_TIMEOUT, 'ms');
      }

      return result;
    } catch (error) {
      console.error('Gemini analysis error:', error);
      return null;
    }
  }

  static getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      litter: 'Litter / Debris',
      path_obstruction: 'Path Obstruction',
      road_damage: 'Road Damage',
      other: 'Other Issue',
    };
    return labels[category] || 'Other Issue';
  }

  static getRoutingLabel(routing: string): string {
    const labels: Record<string, string> = {
      municipal_works: 'Municipal Public Works',
      community_cleanup: 'Community Cleanup',
      accessibility_review: 'Accessibility Review',
      manual_review: 'Manual Review Required',
    };
    return labels[routing] || 'Manual Review Required';
  }
}
