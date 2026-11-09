import { supabase, isSupabaseConfigured } from '../config/supabase';
import type { Note, Subject, UploadProgressState } from '../types';

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatSupabaseNote(row: any): Note {
  const subjectName = row.subjects?.name || row.subject || 'General';
  const fileUrl = row.file_url || row.fileUrl || '';
  const fileSizeFormatted = row.file_size || row.fileSizeFormatted || '0 Bytes';
  const isLabRecord = row.is_lab_record !== undefined ? Boolean(row.is_lab_record) : Boolean(row.isLabRecord);

  const urlLower = fileUrl.toLowerCase();
  const isUrlPdf = urlLower.endsWith('.pdf') || urlLower.includes('.pdf?');
  const isUrlPptx = urlLower.endsWith('.pptx') || urlLower.endsWith('.ppt') || urlLower.includes('.pptx?') || urlLower.includes('.ppt?');

  const isPptx = !isUrlPdf && (
    isUrlPptx ||
    (row.file_type && (row.file_type.includes('presentation') || row.file_type.includes('powerpoint'))) ||
    (!row.file_type && row.title && (row.title.toLowerCase().endsWith('.pptx') || row.title.toLowerCase().endsWith('.ppt')))
  );

  const detectedFileType = isUrlPdf
    ? 'application/pdf'
    : (row.file_type || (isPptx ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf'));

  const fileName =
    row.fileName ||
    (row.title
      ? isPptx && !row.title.toLowerCase().endsWith('.pptx') && !row.title.toLowerCase().endsWith('.ppt')
        ? `${row.title}.pptx`
        : row.title.toLowerCase().endsWith('.pdf')
        ? row.title
        : `${row.title}.pdf`
      : isPptx
      ? 'presentation.pptx'
      : 'document.pdf');

  return {
    id: String(row.id),
    title: row.title,
    subject_id: row.subject_id,
    subject: subjectName,
    unit: row.unit || 'Unit 1',
    semester: row.semester || 'Sem 6',
    description: row.description || '',
    file_url: fileUrl,
    fileUrl: fileUrl,
    file_size: row.file_size || fileSizeFormatted,
    fileSizeFormatted: fileSizeFormatted,
    file_type: detectedFileType,
    fileName: fileName,
    fileSizeBytes: 0,
    uploadedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    is_lab_record: isLabRecord,
    isLabRecord: isLabRecord,
    subjects: row.subjects,
  };
}

// ----------------------------------------------------
// Subjects Management
// ----------------------------------------------------

export async function fetchSubjects(): Promise<Subject[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Failed to fetch subjects from Supabase:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('Error fetching subjects:', err);
    return [];
  }
}

export async function createSubject(name: string): Promise<Subject> {
  const cleanName = name.trim();
  const { data, error } = await supabase
    .from('subjects')
    .insert([{ name: cleanName }])
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to create subject');
  }
  return data;
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message || 'Failed to delete subject');
  }
}

// ----------------------------------------------------
// Notes Management
// ----------------------------------------------------

export async function fetchNotes(): Promise<Note[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*, subjects(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to fetch notes from Supabase:', error);
      return [];
    }

    return (data || []).map(formatSupabaseNote);
  } catch (err) {
    console.warn('Error in fetchNotes:', err);
    return [];
  }
}

export function subscribeToNotes(callback: (notes: Note[]) => void): () => void {
  fetchNotes().then(callback);

  if (!isSupabaseConfigured) {
    return () => {};
  }

  const channel = supabase
    .channel('notes-realtime-feed')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes' },
      () => {
        fetchNotes().then(callback);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export interface UploadController {
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}

export function uploadNoteResumable(
  file: File,
  metadata: {
    title: string;
    subjectId: string;
    unit: string;
    semester: string;
    description?: string;
    isLabRecord?: boolean;
    user: {
      uid: string;
      email: string;
      displayName: string;
    };
  },
  onProgress: (state: UploadProgressState) => void,
  onComplete: (note: Note) => void,
  onError: (error: Error) => void
): UploadController {
  let isCancelled = false;

  const performUpload = async () => {
    try {
      let uploadFile: File | Blob = file;
      let uploadFileName = file.name;
      let detectedContentType = file.type || 'application/pdf';

      const isPpt =
        file.name.toLowerCase().endsWith('.pptx') ||
        file.name.toLowerCase().endsWith('.ppt') ||
        file.type.includes('presentation') ||
        file.type.includes('powerpoint');

      if (isPpt) {
        onProgress({
          isUploading: true,
          isPaused: false,
          progressPercent: 20,
          bytesTransferred: Math.round(file.size * 0.2),
          totalBytes: file.size,
          transferredFormatted: formatBytes(Math.round(file.size * 0.2)),
          totalFormatted: formatBytes(file.size),
          fileName: 'Converting presentation to high-fidelity PDF...',
        });

        try {
          const formData = new FormData();
          formData.append('file', file);
          const convertRes = await fetch('/api/convert-pptx', {
            method: 'POST',
            body: formData,
          });

          if (convertRes.ok) {
            const pdfBlob = await convertRes.blob();
            const baseName = file.name.replace(/\.[^/.]+$/, '');
            uploadFileName = `${baseName}.pdf`;
            uploadFile = new File([pdfBlob], uploadFileName, { type: 'application/pdf' });
            detectedContentType = 'application/pdf';
          }
        } catch (convertErr) {
          console.warn('PPTX auto-conversion notice:', convertErr);
        }
      }

      onProgress({
        isUploading: true,
        isPaused: false,
        progressPercent: 45,
        bytesTransferred: Math.round(uploadFile.size * 0.45),
        totalBytes: uploadFile.size,
        transferredFormatted: formatBytes(Math.round(uploadFile.size * 0.45)),
        totalFormatted: formatBytes(uploadFile.size),
        fileName: uploadFileName,
      });

      // 1. Upload to Supabase Storage Bucket 'notes'
      const cleanFileName = uploadFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${Date.now()}_${cleanFileName}`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from('notes')
        .upload(filePath, uploadFile, {
          contentType: detectedContentType,
          upsert: false,
        });

      if (isCancelled) return;

      if (storageError) {
        throw new Error(storageError.message || 'Supabase Storage upload failed.');
      }

      onProgress({
        isUploading: true,
        isPaused: false,
        progressPercent: 85,
        bytesTransferred: Math.round(uploadFile.size * 0.85),
        totalBytes: uploadFile.size,
        transferredFormatted: formatBytes(Math.round(uploadFile.size * 0.85)),
        totalFormatted: formatBytes(uploadFile.size),
        fileName: uploadFileName,
      });

      // 2. Obtain Public or Signed URL
      const { data: publicUrlData } = supabase.storage
        .from('notes')
        .getPublicUrl(storageData.path);

      const fileUrl = publicUrlData.publicUrl;

      // 3. Insert metadata record into table 'notes'
      const { data: noteRow, error: dbError } = await supabase
        .from('notes')
        .insert([
          {
            title: metadata.title,
            subject_id: metadata.subjectId,
            unit: metadata.unit,
            file_url: fileUrl,
            file_size: formatBytes(file.size),
            file_type: detectedContentType,
            semester: metadata.semester,
            description: metadata.description || '',
            is_lab_record: Boolean(metadata.isLabRecord),
          },
        ])
        .select('*, subjects(name)')
        .single();

      if (isCancelled) return;

      if (dbError) {
        throw new Error(dbError.message || 'Failed to insert note into database.');
      }

      onProgress({
        isUploading: false,
        isPaused: false,
        progressPercent: 100,
        bytesTransferred: file.size,
        totalBytes: file.size,
        transferredFormatted: formatBytes(file.size),
        totalFormatted: formatBytes(file.size),
        fileName: file.name,
      });

      const finalNote = formatSupabaseNote(noteRow);
      onComplete(finalNote);
    } catch (err: any) {
      if (!isCancelled) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  performUpload();

  return {
    cancel: () => {
      isCancelled = true;
    },
    pause: () => {},
    resume: () => {},
  };
}

export async function deleteNote(note: Note): Promise<void> {
  // 1. Delete from Supabase PostgreSQL table
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', note.id);

  if (error) {
    throw new Error(error.message || 'Failed to delete note from database.');
  }

  // 2. Remove file from Supabase storage if file_url points to Supabase storage
  const url = note.file_url || note.fileUrl;
  if (url) {
    const match = url.match(/\/notes\/(.+)$/);
    if (match && match[1]) {
      const filePath = decodeURIComponent(match[1]);
      await supabase.storage.from('notes').remove([filePath]).catch((err) => {
        console.warn('Storage delete warning:', err);
      });
    }
  }
}

export async function getNoteBlobUrl(note: Note): Promise<string> {
  return note.file_url || note.fileUrl;
}
