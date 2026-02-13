"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { AppLayout } from "../components/AppLayout";

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();

  const uploadMutation = trpc.files.upload.useMutation({
    onSuccess: (data) => {
      setUploadResult(data);
      setIsUploading(false);
      setError(null);
    },
    onError: (error) => {
      setError(error.message);
      setIsUploading(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a file");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result;
        if (typeof result === "string") {
          // Remove data URL prefix if present
          const base64Data = result.includes(",")
            ? result.split(",")[1]
            : result;

          await uploadMutation.mutateAsync({
            filename: selectedFile.name,
            mimeType: selectedFile.type || "application/octet-stream",
            data: base64Data,
          });
        }
      };
      reader.onerror = () => {
        setError("Failed to read file");
        setIsUploading(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      setError(err.message || "Failed to upload file");
      setIsUploading(false);
    }
  };

  if (userLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center min-h-screen">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </AppLayout>
    );
  }

  if (!userData?.user) {
    router.push("/");
    return null;
  }

  const user = userData.user;

  return (
    <AppLayout>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h1 className="card-title text-3xl mb-2">
              Upload File
            </h1>
            <p className="text-base-content/70 mb-6">
              Upload a file and let AI extract facts and relations automatically.
              The file will be processed using OpenAI to identify key information
              and relationships.
            </p>

          {/* File Input */}
          <div className="form-control mb-6">
            <label className="label">
              <span className="label-text font-medium">Select File</span>
            </label>
            <div className="border-2 border-dashed border-base-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="file-input file-input-bordered file-input-primary w-full max-w-xs hidden"
                accept=".txt,.md,.json,.pdf,.doc,.docx,.xlsx"
              />
              {selectedFile ? (
                <div>
                  <svg
                    className="w-12 h-12 text-primary mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-base-content font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-base-content/60">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    className="btn btn-sm btn-error btn-outline mt-2"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <svg
                    className="w-12 h-12 text-base-content/40 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-link btn-primary"
                  >
                    Click to select file
                  </button>
                  <p className="text-sm text-base-content/60 mt-2">
                    or drag and drop
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="alert alert-error mb-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className="alert alert-success mb-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="w-full">
                <h3 className="font-bold text-lg mb-2">Upload Successful!</h3>
                <div className="space-y-1 text-sm">
                  <p>
                    <strong>File:</strong> {uploadResult.file.original_filename}
                  </p>
                  <p>
                    <strong>Facts Created:</strong> {uploadResult.factsCreated}
                  </p>
                  <p>
                    <strong>Relations Created:</strong> {uploadResult.relationsCreated}
                  </p>
                  {uploadResult.facts.length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer font-medium">
                        View Extracted Facts ({uploadResult.facts.length})
                      </summary>
                      <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                        {uploadResult.facts.map((fact: any, idx: number) => (
                          <div
                            key={idx}
                            className="card bg-base-100 border border-success/20"
                          >
                            <div className="card-body p-3">
                              <p>{fact.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="btn btn-primary w-full"
          >
            {isUploading ? (
              <>
                <span className="loading loading-spinner"></span>
                Processing with AI...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                Upload and Extract Facts
              </>
            )}
          </button>

          <p className="text-xs text-base-content/60 mt-4 text-center">
            Files are processed using OpenAI to automatically extract facts and
            identify relationships. The original file is preserved and linked to
            the extracted knowledge.
          </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

