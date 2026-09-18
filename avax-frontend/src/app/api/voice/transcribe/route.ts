import { NextRequest, NextResponse } from 'next/server';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Native Next.js Speech-to-Text endpoint powered by Google Gemini 1.5 Flash.
 * Accepts audio file (webm, wav, ogg, mp3, m4a) via multipart/form-data or raw JSON base64.
 * Returns { text: string, duration?: number, success: true }
 */
export async function POST(req: NextRequest) {
  try {
    let audioBase64 = '';
    let mimeType = 'audio/webm';
    let promptText = 'Accurately transcribe all spoken speech in this audio into clean text. If there is no audible speech, return an empty string. Return ONLY the verbatim transcribed text without commentary, quotes, or markdown prefixes.';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('audio') as File | null;
      const customPrompt = formData.get('prompt') as string | null;
      if (customPrompt) promptText = customPrompt;

      if (!file) {
        return NextResponse.json(
          { error: 'No audio file provided in "audio" field', success: false },
          { status: 400 }
        );
      }

      mimeType = file.type || 'audio/webm';
      // Normalize mime types for Gemini
      if (mimeType.includes('webm')) mimeType = 'audio/webm';
      else if (mimeType.includes('wav')) mimeType = 'audio/wav';
      else if (mimeType.includes('ogg')) mimeType = 'audio/ogg';
      else if (mimeType.includes('mp4') || mimeType.includes('m4a')) mimeType = 'audio/mp4';
      else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) mimeType = 'audio/mp3';

      const arrayBuffer = await file.arrayBuffer();
      audioBase64 = Buffer.from(arrayBuffer).toString('base64');
    } else {
      const body = await req.json();
      audioBase64 = body.audioBase64 || body.audio || '';
      mimeType = body.mimeType || 'audio/webm';
      if (body.prompt) promptText = body.prompt;
    }

    if (!audioBase64) {
      return NextResponse.json(
        { error: 'Audio data is empty', success: false },
        { status: 400 }
      );
    }

    if (!GEMINI_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured on the server', success: false },
        { status: 500 }
      );
    }

    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    // Call Google Gemini multimodal endpoint for native STT
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: audioBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('[Gemini STT] API error:', geminiResponse.status, errText);
      return NextResponse.json(
        { error: `Gemini STT error: ${geminiResponse.statusText}`, details: errText, success: false },
        { status: geminiResponse.status }
      );
    }

    const data = await geminiResponse.json();
    const candidateText =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    return NextResponse.json({
      text: candidateText,
      model: GEMINI_MODEL,
      success: true,
    });
  } catch (error: any) {
    console.error('[STT API Error]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to transcribe audio', success: false },
      { status: 500 }
    );
  }
}
