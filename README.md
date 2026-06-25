# ⚡ ZeroHour: Last-Minute AI Guardian & Productivity Companion

ZeroHour is a highly polished, full-stack AI productivity companion engineered to help users organize, prioritize, and conquer tasks, specifically designed for peak efficiency when deadlines are dangerously close. By combining standard scheduling parameters with custom priority calculations and generative AI, ZeroHour helps procrastinators and high-performers alike take control of their schedules.

[![ZeroHour App](https://img.shields.io/badge/ZeroHour-AI%20Guardian-indigo?style=for-the-badge)](https://github.com/Rayyan2005-git/ZeroHour)
[![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Express%20%7C%20Firebase-blue?style=for-the-badge)](https://github.com/Rayyan2005-git/ZeroHour)
[![Model](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-orange?style=for-the-badge)](https://github.com/Rayyan2005-git/ZeroHour)

---

## 🛠️ Complete Tech Stack

ZeroHour is built using modern, production-ready full-stack tools:

### 💻 Frontend (Client)
*   **React 19 & Vite 6**: Lightning-fast Hot Module Replacement (HMR) and optimal single-page application bundling.
*   **Tailwind CSS v4**: Ultra-clean, modular modern design with native CSS variables and beautiful, utility-first styling.
*   **TypeScript 5.8**: Robust, type-safe development across all screens and components.
*   **Framer Motion (v12)**: Smooth micro-interactions, layout animations, staggered entrances, and polished modal transitions.
*   **Lucide React (v0.546)**: Uniform, elegant vector-based iconography.
*   **Web Speech API**: In-app speech recognition for hands-free natural language dictation.

### ⚙️ Backend (Server)
*   **Node.js & Express 4**: Modular, high-performance API routing and static asset distribution.
*   **tsx**: Seamless development execution of TypeScript server files directly.
*   **esbuild**: Production compiler that compiles and bundles the backend TypeScript server into a standalone CommonJS file (`dist/server.cjs`) to ensure quick cold-starts and clean relative import pathing.
*   **Nodemailer**: Secure SMTP client handling real-time automatic email alert dispatches.

### 🗄️ Database, Authentication & Storage
*   **Cloud Firestore**: Flexible, schema-free persistent document database storing tasks, user settings, and progress analytics.
*   **Firebase Authentication**: Streamlined user sessions, profile management, and database-level security rules.

### 🧠 Generative AI Core
*   **Google Gen AI SDK (`@google/genai` v2.4)**: Leverage the advanced, state-of-the-art **Gemini 2.5 Flash** model for parsing voice dictations, structuring task metadata, conducting progress briefings, and auto-generating rescue checklists.

---

## 🌟 Key Features

### 📊 1. Core Analytics Dashboard & Streaks
An immersive dashboard displaying your productivity performance metrics:
*   **Active Objectives**: Live task counter and quick filters.
*   **Streak Tracker**: Track your daily consecutive on-time completions to gamify motivation.
*   **Completion Rate Visualizer**: An SVG-rendered concentric chart indicating progress.
*   **Urgent & Critical Badges**: Color-coded badges indicating high-priority tasks.

### 🎙️ 2. Natural Language Task Voice & Text Dictator
Create a task simply by describing it. Tap the microphone icon to activate voice transcription or type it out:
*   *Prompt example*: *"Create pitch deck presentation by tomorrow at 2 PM, will take me about 3 hours, extremely critical."*
*   **AI Extraction**: Gemini analyzes the text, parsing it into a structured title, accurate deadline timestamp, estimated effort in minutes, category (e.g., Work, Personal, School), and priority score.

### ⏳ 3. Smart Greedy-Timeline & Overflow Deferral
ZeroHour does not just list tasks—it builds your day:
*   **Greedy Scheduling**: Ranks tasks based on urgency, estimated effort, and priority weight. It packs them into a chronological hourly timeline to fit your target daily available hours.
*   **Graceful Overflow**: Any task that exceeds your available hours budget is automatically moved to the **Deferred to Next Session** block, protecting you from scheduling burnout.

### 🚨 4. AI Rescue Mode & Generative Action Checklists
When a task is overdue or the deadline is dangerously close, users can engage **AI Rescue Mode**:
*   Gemini runs a targeted diagnostic on the objective and formulates a highly optimized, custom **Rescue Checklist**.
*   It filters out non-essential activities, giving you a minimal, bite-sized list of immediate, realistic action items to rescue the objective in the eleventh hour.

### 📈 5. Smart Executive Focus Briefings
Get a smart, contextual overview of your current goals:
*   Gemini reviews all your pending tasks and deadlines, compiling an encouraging, highly focused executive brief.
*   Includes motivational advice, tactical suggestions on what to tackle first, and warnings about approaching critical zones.

### ✉️ 6. Nodemailer Automated Email Alerts
Protect yourself from forgotten deadlines with proactive background notifications:
*   A client-side polling monitor watches your active tasks and coordinates with a secure backend `/api/tasks/send-deadline-alert` route.
*   If an objective is within **3 hours of its deadline** and has not been completed, Nodemailer sends an automatic alert directly to your configured notification email.

---

## 🚀 Step-by-Step Feature Demo

Follow this step-by-step walkthrough to test and demonstrate all features:

### 📍 Step 1: Sign Up & Setup Available Hours
1.  Open the application and create an account or sign in.
2.  Navigate to **Settings** (or click the Cog icon).
3.  Set your name, your target notification email (e.g. `yourname@example.com`), and select your **Daily Available Hours** budget (e.g. `8` hours).

### 📍 Step 2: Voice Dictate a Task
1.  Click the **Add Objective** tab in the main navigation.
2.  Tap the **Microphone** button (grant microphone permissions if prompted) and speak or type:
    > *"Draft the quarterly budget report by Friday at 5 PM, it's very important and will take me around 2 hours."*
3.  Tap **Engage Gemini Parser** (or submit).
4.  Watch the AI parse your prompt in real-time. Review the parsed title, effort (120 min), category (Finance/Work), and priority score.
5.  Click **Commit to Calendar** to add it to your tasks.

### 📍 Step 3: Inspect the Smart Priority Timeline
1.  Navigate to the **Smart Schedule** tab.
2.  Observe how your active tasks are sorted chronologically. Tasks are scheduled in hourly slots starting from 9:00 AM up to your daily hours budget.
3.  Add multiple large tasks to watch the budget exceed. Notice how excess items are gracefully grouped under the **Deferred to Next Session (Overflow)** section.

### 📍 Step 4: Engage AI Rescue Mode
1.  Click on any urgent task card to open the **Objective Detail Panel**.
2.  If the deadline is close, the **AI Rescue Mode** button becomes highly visible. Click on **Initiate Rescue Protocol**.
3.  Wait a few seconds while Gemini develops a custom battle plan.
4.  Observe your new step-by-step **Rescue Checklist** appear. Mark each sub-step as complete and watch your progress bar move towards 100%!

### 📍 Step 5: Read the Executive Briefing
1.  On the main **Dashboard**, click the **Generate Executive Briefing** button.
2.  Gemini will read your calendar state and generate a custom, motivational brief summarizing your focus areas, active workload, and tips for staying calm under pressure.

### 📍 Step 6: Test Approaching Deadline Email Alerts
1.  Create an objective with a deadline set to **1.5 hours in the future**.
2.  Make sure your notification email is set up in your profile.
3.  The client-side task checker will detect this critical task and automatically contact `/api/tasks/send-deadline-alert`.
4.  Check your inbox for a professional alert from *ZeroHour Last-Minute Guardian* outlining the urgent deadline and prompt actions to take!

---

## 🛠️ Installation & Local Setup

Get ZeroHour running on your local machine:

### 1. Clone the Repository
```bash
git clone https://github.com/Rayyan2005-git/ZeroHour.git
cd ZeroHour
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# Gemini API Key (Secret, Server-Side Only)
GEMINI_API_KEY=your_gemini_api_key_here

# Nodemailer SMTP Credentials (Optional - for Email Alerts)
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_gmail_app_password
```

### 4. Configure Firebase
Provide your configuration in `firebase-applet-config.json` inside the root directory:
```json
{
  "apiKey": "your-api-key",
  "authDomain": "your-app.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-app.appspot.com",
  "messagingSenderId": "your-sender-id",
  "appId": "your-app-id",
  "firestoreDatabaseId": "(default)"
}
```

### 5. Start Development Server
```bash
npm run dev
```
The app will bind to `http://localhost:3000` (development proxy routes static and API requests dynamically).

---

## 📦 Production Deployment

To build and run the application in a production environment:

```bash
# 1. Compile frontend assets & bundle the Express backend server
npm run build

# 2. Start the production Node server
npm run start
```

---

*Crafted for high performance, distraction-free productivity, and emergency deadline rescues. Take control of your Zero Hour.*
