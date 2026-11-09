export interface Subject {
  id: string;
  name: string;
  created_at?: string;
}

export interface Note {
  id: string;
  title: string;
  subject_id?: string;
  subject: string;
  unit: string;
  semester?: string;
  description?: string;
  file_url?: string;
  fileUrl: string;
  file_size?: string;
  fileSizeFormatted: string;
  file_type?: string;
  fileName?: string;
  fileSizeBytes?: number;
  totalPages?: number;
  created_at?: string;
  uploadedAt: number;
  uploadedBy?: {
    uid: string;
    email: string;
    displayName: string;
  };
  is_lab_record?: boolean;
  isLabRecord?: boolean;
  subjects?: {
    name: string;
  } | null;
}

export interface WhitelistEntry {
  id: string;
  email: string;
  addedAt: number;
  addedBy?: string;
  notes?: string;
}

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccessRequest {
  id?: string;
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  status: AccessRequestStatus;
  requestedAt: number | any;
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface PresenceUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  joinedAt: number;
  lastActive?: number;
  onlineSince?: string;
  viewingSince?: string;
  currentNoteId?: string;
  currentNoteTitle?: string;
  role?: 'admin' | 'student';
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAdmin: boolean;
  role?: 'admin' | 'student';
}

export interface UploadProgressState {
  isUploading: boolean;
  isPaused: boolean;
  progressPercent: number;
  bytesTransferred: number;
  totalBytes: number;
  transferredFormatted: string;
  totalFormatted: string;
  fileName: string;
  error?: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  suggestedAction?: string;
}
