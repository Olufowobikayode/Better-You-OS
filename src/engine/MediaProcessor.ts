import * as faceapi from 'face-api.js';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// Initialize pdfjs worker using a reliable CDN
// For version 5.x, the worker is an ES module (.mjs)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

let modelsLoaded = false;

export const loadFaceApiModels = async () => {
  if (modelsLoaded) return;
  try {
    // We need to load models from a public URL or local path.
    // For browser environments, we can use a CDN.
    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
    ]);
    modelsLoaded = true;
    console.log("Face API models loaded successfully");
  } catch (e) {
    console.error("Failed to load Face API models", e);
  }
};

export const analyzeImage = async (base64Image: string, mimeType: string): Promise<string> => {
  try {
    await loadFaceApiModels();
    
    // Create an HTML image element
    const img = new Image();
    img.src = `data:${mimeType};base64,${base64Image}`;
    await new Promise((resolve, reject) => { 
      img.onload = resolve; 
      img.onerror = () => reject(new Error("Image failed to load"));
    });

    let analysisText = "";

    // 1. Face Detection & Expressions
    if (modelsLoaded) {
      const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceExpressions();
      if (detections.length > 0) {
        analysisText += `[Facial Recognition]: Detected ${detections.length} face(s). `;
        detections.forEach((d, i) => {
          const expressions = d.expressions;
          const dominantExpression = Object.keys(expressions).reduce((a, b) => expressions[a as keyof typeof expressions] > expressions[b as keyof typeof expressions] ? a : b);
          analysisText += `Face ${i+1} is showing ${dominantExpression}. `;
        });
      } else {
        analysisText += `[Facial Recognition]: No faces detected. `;
      }
    }

    // 2. OCR (Optical Character Recognition)
    const { data: { text } } = await Tesseract.recognize(
      `data:${mimeType};base64,${base64Image}`,
      'eng',
      { logger: m => console.log(m) }
    );
    
    if (text && text.trim().length > 0) {
      analysisText += `\n[OCR Text Extracted]: ${text.trim()}`;
    }

    return analysisText;
  } catch (e) {
    console.error("Image analysis failed", e);
    return "[Image analysis failed]";
  }
};

export const extractPdfText = async (base64Pdf: string): Promise<string> => {
  try {
    const binaryString = atob(base64Pdf);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + "\n";
    }
    
    return `[PDF Text Extracted]: ${fullText.substring(0, 5000)}...`; // Limit to 5000 chars
  } catch (e) {
    console.error("PDF extraction failed", e);
    return "[PDF extraction failed]";
  }
};
