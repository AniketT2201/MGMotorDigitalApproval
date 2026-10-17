
import * as React from 'react';
import { IAttachment } from '../utils/constants';
import { getPreviewKind, toFileArray } from '../utils/helpers';

/* ------------------------------ file picker ----------------------------- */

export interface IAttachmentUploadProps {
  multiple?: boolean;
  hint: string;
  describeSelection: (files: File[]) => string;
  onChange?: (files: File[]) => void;

  // New UI/API and existing attachment compatibility
  existingFileNames?: string[];
  existingFiles?: IAttachment[];
  onRemoveExisting?: (file: IAttachment) => void;

  // Prevent uploads/removals while saving
  disabled?: boolean;

  children?: React.ReactNode;
}

export const AttachmentUpload: React.FC<IAttachmentUploadProps> = (props) => {
  const [files, setFiles] = React.useState<File[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const updateFiles = (selected: File[]): void => {
    setFiles(selected);
    props.onChange?.(selected);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const input = e.currentTarget;
    updateFiles(toFileArray(input.files));

    // Allow selecting the same file again.
    input.value = '';
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>
  ): void => {
    e.preventDefault();
    setIsDragging(false);

    if (props.disabled) return;

    const droppedFiles = Array.from(e.dataTransfer.files);

    if (droppedFiles.length === 0) return;

    updateFiles(
      props.multiple ? droppedFiles : [droppedFiles[0]]
    );
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileIcon = (file: File): string => {
    const name = file.name.toLowerCase();

    if (file.type.startsWith('image/')) return '🖼️';

    if (
      file.type === 'application/pdf' ||
      name.endsWith('.pdf')
    ) {
      return '📕';
    }

    if (/\.(doc|docx)$/i.test(name)) return '📝';
    if (/\.(xls|xlsx|csv)$/i.test(name)) return '📊';

    return '📄';
  };

  const existingFiles = props.existingFiles || [];
  const existingFileNames = props.existingFileNames || [];

  return (
    <div className="filebox">
      {/* OLD UI: same upload layout and CSS classes */}
      <div
        className={`attachment-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!props.disabled) setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
        onClick={() => {
          if (!props.disabled) inputRef.current?.click();
        }}
        role="button"
        tabIndex={props.disabled ? -1 : 0}
        aria-label="Upload attachments"
        aria-disabled={props.disabled || false}
        onKeyDown={(e) => {
          if (
            !props.disabled &&
            (e.key === 'Enter' || e.key === ' ')
          ) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          className="attachment-input"
          type="file"
          multiple={props.multiple}
          disabled={props.disabled}
          onChange={handleChange}
          onClick={(e) => e.stopPropagation()}
        />

        <div className="attachment-upload-icon">
          <svg
            viewBox="0 0 24 24"
            width="30"
            height="30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4m-5 5 5-5 5 5" />
            <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
          </svg>
        </div>

        <div className="attachment-upload-title">
          Drop your files here, or{' '}
          <span className="attachment-browse">browse files</span>
        </div>

        <div className="attachment-upload-hint">
          {files.length
            ? props.describeSelection(files)
            : props.hint}
        </div>

        <div className="attachment-upload-meta">
          <span>
            <span className="attachment-meta-dot" />
            {' '}Secure attachment area
          </span>
          <span>
            {props.multiple
              ? 'Multiple files supported'
              : 'Single file upload'}
          </span>
        </div>
      </div>

      {/* NEW FUNCTIONALITY: selected files, icons, sizes and removal */}
      {files.length > 0 && (
        <div className="attachment-selected">
          <div className="attachment-selected-heading">
            <span>Selected files</span>
            <span className="attachment-count">{files.length}</span>
          </div>

          {files.map((file, index) => (
            <div
              className="attachment-file-row"
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
            >
              <span className="attachment-file-icon">
                {getFileIcon(file)}
              </span>

              <div className="attachment-file-info">
                <div
                  className="attachment-file-name"
                  title={file.name}
                >
                  {file.name}
                </div>
                <div className="attachment-file-size">
                  {formatSize(file.size)}
                </div>
              </div>

              <span className="attachment-file-check" title="Selected">
                ✓
              </span>

              <button
                type="button"
                className="attachment-remove"
                aria-label={`Remove ${file.name}`}
                disabled={props.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  updateFiles(files.filter((_, i) => i !== index));
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Existing stored attachments with links and remove callbacks */}
      {existingFiles.length > 0 && (
        <div className="file-list attachment-existing">
          <div className="attachment-selected-heading">
            Previously attached files
          </div>

          {existingFiles.map((file, index) => (
            <span
              className="file-chip"
              key={file.fileName || `${file.name}-${index}`}
            >
              <a href={file.url} target="_blank" rel="noreferrer">
                📎 {file.name}
              </a>

              {props.onRemoveExisting && (
                <button
                  type="button"
                  className="chip-x"
                  title={`Remove ${file.name}`}
                  aria-label={`Remove ${file.name}`}
                  disabled={props.disabled}
                  onClick={() => props.onRemoveExisting?.(file)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Also supports the newer names-only API */}
      {existingFiles.length === 0 && existingFileNames.length > 0 && (
        <div className="file-list attachment-existing">
          <div className="attachment-selected-heading">
            Previously attached files
          </div>

          {existingFileNames.map((name, index) => (
            <span className="file-chip" key={`${name}-${index}`}>
              📎 {name}
            </span>
          ))}
        </div>
      )}

      {props.children}
    </div>
  );
};

/* ----------------------------- file preview ----------------------------- */

export interface IFilePreviewProps {
  name: string;
  label: string;
  preview?: string;
}

export const FilePreview: React.FC<IFilePreviewProps> = (props) => {
  if (!props.name) {
    return (
      <span className="muted small">
        No {props.label} attached.
      </span>
    );
  }

  const preview = props.preview;
  const kind = getPreviewKind(preview);

  const isLocalPreview =
    !!preview &&
    (preview.indexOf('data:') === 0 ||
      preview.indexOf('blob:') === 0);

  const isStored = !!preview && !isLocalPreview;

  return (
    <>
      <div className="preview-header">
        <span className="file-chip">📄 {props.name}</span>

        {isStored ? (
          <a href={preview} target="_blank" rel="noreferrer">
            Open file
          </a>
        ) : (
          <span className="preview-label">
            {isLocalPreview
              ? 'Selected file (not saved yet)'
              : 'File preview'}
          </span>
        )}
      </div>

      {kind === 'pdf' && preview && (
        <iframe
          className="doc-preview"
          src={preview}
          title={props.name}
        />
      )}

      {kind === 'image' && preview && (
        <img
          className="img-preview"
          src={preview}
          alt={props.name}
        />
      )}

      {kind === 'generic' && (
        <div className="generic-preview">
          <div className="preview-icon">📄</div>
          <div>
            <b>{props.name}</b>
            <div className="small muted">
              No inline preview for this file type
              {isStored ? ' — use "Open file".' : '.'}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
