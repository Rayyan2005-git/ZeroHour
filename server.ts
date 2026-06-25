/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini Client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not configured in Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Resilient wrapper to execute Gemini requests with retries and fallback models.
 */
async function generateContentWithRetry(
  contents: any,
  config: any,
  primaryModel: string = 'gemini-3.5-flash',
  fallbackModel: string = 'gemini-3.1-flash-lite',
  maxRetries: number = 3
): Promise<any> {
  const ai = getGeminiClient();
  let lastError: any = null;

  // Try the primary model
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Gemini API] Call attempt ${attempt}/${maxRetries} using model: ${primaryModel}`);
      const response = await ai.models.generateContent({
        model: primaryModel,
        contents,
        config,
      });
      return response;
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || '';
      const isTemporary = 
        error.status === 503 || 
        error.status === 429 || 
        errorMsg.includes('503') || 
        errorMsg.includes('demand') || 
        errorMsg.includes('UNAVAILABLE') || 
        errorMsg.includes('429') || 
        errorMsg.includes('quota') || 
        errorMsg.includes('overloaded');
      
      if (isTemporary && attempt < maxRetries) {
        const delay = attempt * 1000;
        console.log(`[Gemini API] Primary model ${primaryModel} busy (Attempt ${attempt}). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  // If primary fails, fall back to the secondary model
  if (fallbackModel && fallbackModel !== primaryModel) {
    console.log(`[Gemini API] Primary model ${primaryModel} busy. Checking secondary model: ${fallbackModel}`);
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini API] Fallback attempt ${attempt}/${maxRetries} using model: ${fallbackModel}`);
        const response = await ai.models.generateContent({
          model: fallbackModel,
          contents,
          config,
        });
        return response;
      } catch (error: any) {
        lastError = error;
        const errorMsg = error.message || '';
        const isTemporary = 
          error.status === 503 || 
          error.status === 429 || 
          errorMsg.includes('503') || 
          errorMsg.includes('demand') || 
          errorMsg.includes('UNAVAILABLE') || 
          errorMsg.includes('429') || 
          errorMsg.includes('quota') || 
          errorMsg.includes('overloaded');
        
        if (isTemporary && attempt < maxRetries) {
          const delay = attempt * 1000;
          console.log(`[Gemini API] Secondary model ${fallbackModel} busy (Attempt ${attempt}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }
  }

  throw lastError;
}

/**
 * Highly tactical local heuristic parser to extract task info when API is offline.
 */
function parseTaskLocallyFallback(prompt: string, currentTime?: string): any {
  const now = currentTime ? new Date(currentTime) : new Date();
  
  // Clean command/request prefixes
  let cleanPrompt = prompt.replace(/^(add task|create task|schedule task|new task|i need to|please)\s+/i, '').trim();
  
  // Default values
  let title = cleanPrompt;
  let deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
  let estimatedEffortMinutes = 60;
  let category = 'Hackathon';
  let priorityScore = 50;

  // Keyword check for categories
  const categoryKeywords: { [key: string]: string[] } = {
    'Work': ['work', 'job', 'meeting', 'office', 'boss', 'client', 'email', 'project', 'presentation', 'code', 'deploy', 'fix'],
    'Study': ['study', 'learn', 'read', 'class', 'homework', 'exam', 'quiz', 'course', 'lecture', 'assignment', 'research'],
    'Health': ['gym', 'workout', 'run', 'exercise', 'doctor', 'dentist', 'medication', 'pill', 'sleep', 'rest', 'eat', 'dinner'],
    'Life': ['grocery', 'buy', 'clean', 'wash', 'laundry', 'pay', 'bill', 'rent', 'shop', 'car', 'house'],
    'urgent': ['urgent', 'asap', 'critical', 'immediate', 'emergency', 'fast', 'now']
  };

  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => cleanPrompt.toLowerCase().includes(kw))) {
      category = cat;
      break;
    }
  }

  // Simple relative deadline extraction
  const lowerPrompt = cleanPrompt.toLowerCase();
  if (lowerPrompt.includes('today') || lowerPrompt.includes('tonight')) {
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    deadline = todayEnd.toISOString();
    priorityScore = 80;
  } else if (lowerPrompt.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(17, 0, 0, 0); // 5 PM tomorrow
    deadline = tomorrow.toISOString();
    priorityScore = 65;
  } else if (lowerPrompt.includes('in 2 hours') || lowerPrompt.includes('in two hours')) {
    deadline = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    priorityScore = 90;
  } else if (lowerPrompt.includes('in an hour') || lowerPrompt.includes('in 1 hour') || lowerPrompt.includes('in one hour')) {
    deadline = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString();
    priorityScore = 95;
  } else if (lowerPrompt.includes('friday')) {
    const friday = new Date(now);
    const distance = (5 - friday.getDay() + 7) % 7;
    friday.setDate(now.getDate() + (distance === 0 ? 7 : distance));
    friday.setHours(17, 0, 0, 0);
    deadline = friday.toISOString();
    priorityScore = 55;
  }

  // Effort parsing keywords
  if (lowerPrompt.includes('quick') || lowerPrompt.includes('fast') || lowerPrompt.includes('15 min') || lowerPrompt.includes('30 min') || lowerPrompt.includes('simple')) {
    estimatedEffortMinutes = 20;
  } else if (lowerPrompt.includes('big') || lowerPrompt.includes('large') || lowerPrompt.includes('long') || lowerPrompt.includes('hard') || lowerPrompt.includes('hours')) {
    estimatedEffortMinutes = 120;
  }

  // Truncate title nicely if too long
  if (title.length > 60) {
    title = title.substring(0, 57) + '...';
  }

  return {
    title,
    deadline,
    estimatedEffortMinutes,
    category,
    priorityScore
  };
}

/**
 * Highly tactical local rescue checklist generator to execute when API is offline.
 */
function generateRescueChecklistLocallyFallback(title: string, category?: string, estimatedEffortMinutes?: number, hoursRemaining?: number): any[] {
  const hrs = hoursRemaining || 2.5;
  const effort = estimatedEffortMinutes || 60;
  return [
    {
      id: 'step-1',
      title: 'Define Minimal Scope (MVP)',
      instruction: `Slash all secondary requirements. Plan exactly what to build in the next ${(hrs * 0.25 * 60).toFixed(0)} minutes.`,
      completed: false
    },
    {
      id: 'step-2',
      title: 'High-Intensity Focus Block',
      instruction: `Mute notifications and build the core functionality. Aim for ${Math.min(effort, 45)} minutes of active coding.`,
      completed: false
    },
    {
      id: 'step-3',
      title: 'Assemble, Test, & Ship',
      instruction: 'Run sanity tests, wrap up styling, and immediately deploy the final result.',
      completed: false
    }
  ];
}

// API Routes

// 1. Task Parser Endpoint (Text/Voice transcription)
app.post('/api/tasks/parse', async (req, res) => {
  const { prompt, currentTime } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const systemPrompt = `You are the core parser for "ZeroHour" - an AI hackathon productivity assistant.
The current local time is: ${currentTime || new Date().toISOString()}.
Your goal is to parse a natural language task description (possibly transcribed from voice) and return structured information.
Analyze the deadline mentioned, relative dates (like "tomorrow", "Friday 5pm", "in 2 hours"), the category, and the effort required.
If no deadline is mentioned, set it to exactly 24 hours from now.
Provide a realistic initial priorityScore between 0 and 100 based on estimated urgency and importance.`;

    const response = await generateContentWithRetry(
      prompt,
      {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'A concise, action-oriented title for the task.',
            },
            deadline: {
              type: Type.STRING,
              description: 'Parsed ISO 8601 absolute timestamp for the deadline.',
            },
            estimatedEffortMinutes: {
              type: Type.INTEGER,
              description: 'Estimated minutes of active effort required. E.g. quick=15-30, normal=60, a big one=120-180.',
            },
            category: {
              type: Type.STRING,
              description: 'Task category (Work, Study, Health, Life, Hackathon, urgent).',
            },
            priorityScore: {
              type: Type.INTEGER,
              description: 'Initial priority score from 0 (low) to 100 (critical).',
            },
          },
          required: ['title', 'deadline', 'estimatedEffortMinutes', 'category', 'priorityScore'],
        },
      }
    );

    const parsedData = JSON.parse(response.text?.trim() || '{}');
    parsedData.parsingMethod = 'gemini';
    return res.json(parsedData);
  } catch (error: any) {
    console.error('Error parsing task, executing heuristic local fallback:', error);
    try {
      const localResult = parseTaskLocallyFallback(prompt, currentTime);
      localResult.parsingMethod = 'fallback';
      return res.json(localResult);
    } catch (fallbackError: any) {
      return res.status(500).json({ 
        error: 'Failed to parse task description. Both Gemini and local fallback failed.' 
      });
    }
  }
});

// 2. Rescue Mode Generator Endpoint
app.post('/api/tasks/rescue', async (req, res) => {
  const { title, category, estimatedEffortMinutes, hoursRemaining } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  try {
    const systemPrompt = `You are the ZeroHour Rescue Bot. A critical deadline for "${title}" is in only ${hoursRemaining ? hoursRemaining.toFixed(1) : 'less than 3'} hours, and it's not finished!
Create a hyper-minimal, hyper-focused, bulletproof checklist of 3-5 action items to salvaging/delivering a minimal viable version in the remaining time.
Each checklist item should be brief, high-impact, and doable in minutes.`;

    const response = await generateContentWithRetry(
      `Generate rescue checklist for:
Title: ${title}
Category: ${category || 'General'}
Estimated Effort Needed: ${estimatedEffortMinutes || 60} minutes
Hours left: ${hoursRemaining || 2.5} hours`,
      {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: {
                type: Type.STRING,
                description: 'Unique string ID, e.g., "step-1", "step-2".',
              },
              title: {
                type: Type.STRING,
                description: 'Short title of the step (e.g. "Draft outline", "Write core module").',
              },
              instruction: {
                type: Type.STRING,
                description: '1-sentence highly tactical delivery advice.',
              },
              completed: {
                type: Type.BOOLEAN,
                description: 'Set default to false.',
              },
            },
            required: ['id', 'title', 'instruction', 'completed'],
          },
        },
      }
    );

    const checklist = JSON.parse(response.text?.trim() || '[]');
    return res.json(checklist);
  } catch (error: any) {
    console.error('Error generating rescue plan, executing local backup generator:', error);
    try {
      const localChecklist = generateRescueChecklistLocallyFallback(title, category, estimatedEffortMinutes, hoursRemaining);
      return res.json(localChecklist);
    } catch (fallbackError: any) {
      return res.status(500).json({ 
        error: 'Failed to generate rescue checklist. Both Gemini and local fallback failed.' 
      });
    }
  }
});

/**
 * Generates focus summary using local heuristics when Gemini is unavailable.
 */
function generateFocusSummaryLocallyFallback(tasks: any[]): string {
  if (!tasks || tasks.length === 0) {
    return "All quiet on the front! You have no pending tasks today. Use this time to rest or plan your next move.";
  }
  const pending = tasks.filter(t => t.status !== 'completed');
  if (pending.length === 0) {
    return "Great job! All your tasks are completed. You're fully caught up for today!";
  }
  
  // Sort by priorityScore desc
  const sorted = [...pending].sort((a, b) => b.priorityScore - a.priorityScore);
  const topTask = sorted[0];
  const secondTask = sorted[1];

  let summary = `Your chief objective today is "${topTask.title}" (Priority Score: ${topTask.priorityScore}). It has the highest priority and demands immediate focus. `;
  if (secondTask) {
    summary += `Next, allocate attention to "${secondTask.title}". `;
  }
  const lowPriority = sorted.find(t => t.priorityScore < 50);
  if (lowPriority) {
    summary += `Less critical items like "${lowPriority.title}" can slide if you run out of available hours.`;
  } else {
    summary += `Keep driving forward on your remaining objectives to maintain your streak.`;
  }
  return summary;
}

// 3. Daily Focus Summary Generator Endpoint
app.post('/api/tasks/focus-summary', async (req, res) => {
  const { tasks } = req.body;
  if (!tasks) {
    return res.status(400).json({ error: 'Tasks list is required' });
  }

  const pending = tasks.filter((t: any) => t.status !== 'completed');
  if (pending.length === 0) {
    return res.json({ summary: "All quiet on the front! You have no pending tasks today. Use this time to rest or plan your next move." });
  }

  try {
    const taskDetails = pending.map((t: any) => `- ${t.title} (Deadline: ${t.deadline}, Priority: ${t.priorityScore}/100, Est. Effort: ${t.estimatedEffortMinutes}m, Category: ${t.category})`).join('\n');
    const systemPrompt = `You are the ZeroHour daily focus advisor. 
Analyze the operator's pending task list. 
Return a concise, highly specific 2-3 sentence focus summary explaining what critical objective they must prioritize first today and why, and what lesser tasks can slide to tomorrow or wait. 
Keep it punchy, action-oriented, and highly human (do not sound like a machine or output structured bullet lists). Do not include formatting like markdown headings or bullet points.`;

    const response = await generateContentWithRetry(
      `Pending tasks:\n${taskDetails}`,
      {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'A 2-3 sentence focus summary of the operator\'s day.'
            }
          },
          required: ['summary']
        }
      }
    );

    const result = JSON.parse(response.text?.trim() || '{}');
    return res.json({ summary: result.summary || generateFocusSummaryLocallyFallback(tasks) });
  } catch (error: any) {
    console.error('Error generating focus summary, calling local backup:', error);
    try {
      const fallbackSummary = generateFocusSummaryLocallyFallback(tasks);
      return res.json({ summary: fallbackSummary });
    } catch (fallbackError: any) {
      return res.status(500).json({ error: 'Failed to generate focus summary' });
    }
  }
});

// Configure Vite or Static Asset Serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZeroHour full-stack server running on http://localhost:${PORT}`);
  });
}

// EMAIL CONFIGURATION COMMENTS:
// To enable approaching deadline email alerts:
// 1. Set EMAIL_USER in your environment secrets to your Gmail address.
// 2. Set EMAIL_APP_PASSWORD in your environment secrets to your Gmail App Password.
// Ensure you use a Gmail App Password, NOT your main account password.
function getEmailTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: pass
    }
  });
}

// 4. Send Deadline Email Alert Endpoint
app.post('/api/tasks/send-deadline-alert', async (req, res) => {
  const { task, notificationEmail } = req.body;
  if (!task || !notificationEmail) {
    return res.status(400).json({ error: 'task and notificationEmail are required' });
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.log('[Deadline Alerts] Nodemailer transporter not configured (missing EMAIL_USER or EMAIL_APP_PASSWORD). Skipping email alert.');
    return res.status(503).json({ error: 'Nodemailer transporter not configured on server' });
  }

  try {
    const deadline = new Date(task.deadline);
    const now = new Date();
    const timeRemainingMs = deadline.getTime() - now.getTime();
    const minsRemaining = Math.round(timeRemainingMs / (1000 * 60));
    const hrsRemaining = (minsRemaining / 60).toFixed(1);

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: notificationEmail,
      subject: `ZeroHour Alert: "${task.title}" deadline approaching`,
      text: `Your objective "${task.title}" is within ${hrsRemaining} hours of its deadline (${deadline.toLocaleString()}).\n\nTake action immediately: ${appUrl}\n\nThis is an automated alert from ZeroHour Last-Minute Guardian.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Deadline Alerts] Notification email sent successfully to ${notificationEmail} for task "${task.title}"`);
    return res.json({ success: true });
  } catch (err: any) {
    console.error(`[Deadline Alerts] Failed to send email to ${notificationEmail} for task "${task.title}":`, err);
    return res.status(500).json({ error: err.message || 'Failed to send email' });
  }
});

startServer();
