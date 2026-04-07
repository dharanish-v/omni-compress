import { useState, useRef, useEffect } from 'react';
import { triggerFeedback } from '../utils/feedback';

const MAX_FILE_SIZE_MB = 250;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function useFileHandling(isMuted: boolean) {
  const [files, setFiles] = useState<File[]>([]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (originalUrl) {
        URL.revokeObjectURL(originalUrl);
      }
    };
  }, [originalUrl]);

  const processFiles = (selectedFiles: File[]) => {
    for (const selectedFile of selectedFiles) {
      if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        setFileSizeError(
          `File "${selectedFile.name}" is ${(selectedFile.size / 1024 / 1024).toFixed(1)} MB \u2014 exceeds the ${MAX_FILE_SIZE_MB} MB limit. ` +
            `Large files can exhaust WebAssembly memory and crash your browser tab.`,
        );
        setFiles([]);
        setOriginalUrl(null);
        return false;
      }
    }

    setFileSizeError(null);
    setFiles(selectedFiles);
    if (selectedFiles.length === 1) {
      setOriginalUrl(URL.createObjectURL(selectedFiles[0]));
    } else {
      setOriginalUrl(null);
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      triggerFeedback('click', isMuted);
      const selectedFiles = Array.from(e.target.files);
      if (!processFiles(selectedFiles)) {
        e.target.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      triggerFeedback('click', isMuted);
      const droppedFiles = Array.from(e.dataTransfer.files);
      processFiles(droppedFiles);
    }
  };

  const handleClear = () => {
    triggerFeedback('click', isMuted);
    setFiles([]);
    setOriginalUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    triggerFeedback('click', isMuted);
    const newFiles = [...files];
    newFiles.splice(index, 1);
    processFiles(newFiles);
  };

  return {
    files,
    setFiles,
    originalUrl,
    setOriginalUrl,
    fileSizeError,
    setFileSizeError,
    isDragging,
    fileInputRef,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleClear,
    removeFile
  };
}
