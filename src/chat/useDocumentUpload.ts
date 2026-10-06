import { useCallback } from 'react';
import { rejectReason } from './chatTypes';

/** Attachments stay in this browser. No remote object or processing job exists. */
export function useDocumentUpload() {
  const upload = useCallback(async (file: File, _instruction: string): Promise<
    { ok: true; path: string; documentId?: number } | { ok: false; error: string }
  > => {
    void _instruction;
    const error = rejectReason(file);
    if (error) return { ok: false, error };
    return { ok: true, path: `local-preview:${encodeURIComponent(file.name)}` };
  }, []);
  return { upload, ready: true };
}
