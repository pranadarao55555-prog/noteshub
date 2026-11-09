# NotesHub: Handwritten Notes & Lab Records Portal

Private, peer-to-peer DRM study portal for handwritten lecture notes and laboratory journals, powered by **Supabase PostgreSQL & Storage**, **Supabase Realtime Presence**, and **Google Gemini AI**.

---

## Key Capabilities

1. **Role-Based Access Control**:
   - **Students (`!isAdmin`)**: Browse course subjects and units, search, and study documents inside the canvas DRM reader. Upload, edit, and delete options are strictly hidden.
   - **Admin (`isAdmin`)**: Upload notes, assign unit and subject hierarchy, manage subjects dynamically, and delete notes.
2. **Subject & Unit Organization**:
   - Dynamically manage curriculum subjects (`subjects` table in Supabase).
   - Under each subject, notes are tagged and grouped by unit (`Unit 1` through `Unit 5`).
3. **Supabase Cloud Infrastructure**:
   - PostgreSQL schema with Row Level Security (RLS) guaranteeing data safety.
   - Supabase Storage bucket (`notes`) for PDF documents.
   - Supabase Realtime Channels (`online-cohort`) for live peer presence.
4. **Strict DRM Canvas Streaming Reader**:
   - Direct HTTP byte range streaming via PDF.js.
   - Multi-layer DRM canvas rendering with dynamic diagonal watermarking.
   - Interception of print (`Ctrl+P`), save (`Ctrl+S`), developer shortcuts, and context menus.
5. **Gemini AI Academic Assistant**:
   - Slide-out tutor powered by `@google/genai` (with fallback to REST endpoint).
   - Context-aware tutoring with document title, subject, unit, and page number.

---

## Environment Setup (`.env`)

Configure your environment variables in `.env`:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Classroom Admin Email (Upload, delete, and subject management authority)
VITE_ADMIN_EMAIL=admin@noteshub.edu

# Google Gemini API Key for Study Assistant
VITE_GEMINI_API_KEY=your-gemini-api-key
```

---

## Supabase Database & Storage Setup

Run the SQL script located in [`supabase_schema.sql`](./supabase_schema.sql) in your **Supabase Dashboard > SQL Editor**:

1. Creates `subjects` and `notes` tables with foreign keys and indexes.
2. Configures the `notes` storage bucket (500 MB limit, PDF MIME type).
3. Applies Row Level Security (RLS) policies allowing public read access, while restricting upload, edit, and delete permissions to the Admin email (`VITE_ADMIN_EMAIL`).

---

## Development & Build

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Compile TypeScript and build production bundle
npm run build
```
