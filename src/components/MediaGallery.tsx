import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Trash2, Image, FileAudio, FileVideo, Download, Search,
  HardDrive, AlertTriangle, RefreshCw, X,
} from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import {
  listStorageFiles,
  deleteStorageFile,
  listStorageBuckets,
  type StorageFile,
} from "@/lib/storage.functions";

export function MediaGallery() {
  const qc = useQueryClient();
  const [selectedBucket, setSelectedBucket] = useState<string>("album-art");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);

  const listFilesFn = useServerFn(listStorageFiles);
  const deleteFileFn = useServerFn(deleteStorageFile);
  const listBucketsFn = useServerFn(listStorageBuckets);

  const { data: buckets, isLoading: bucketsLoading } = useQuery({
    queryKey: ["storage-buckets"],
    queryFn: () => listBucketsFn(),
    retry: 1,
  });

  const { data: files, isLoading: filesLoading, refetch } = useQuery({
    queryKey: ["storage-files", selectedBucket],
    queryFn: () => listFilesFn({ bucket: selectedBucket }),
    retry: 1,
  });

  const deleteM = useMutation({
    mutationFn: deleteFileFn,
    onSuccess: () => {
      toast.success("🗑️ File deleted successfully!");
      refetch();
      setSelectedFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredFiles = files?.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return <Image className="size-5" />;
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext || '')) {
      return <FileAudio className="size-5" />;
    }
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
      return <FileVideo className="size-5" />;
    }
    return <HardDrive className="size-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleDelete = () => {
    if (!selectedFile) return;
    if (!confirm(`Delete "${selectedFile.name}"? This action cannot be undone.`)) return;
    deleteM.mutate({ bucket: selectedBucket, path: selectedFile.name });
  };

  const handleDownload = () => {
    if (!selectedFile) return;
    const { supabase } = require("@/integrations/supabase/client");
    const { data } = supabase.storage
      .from(selectedBucket)
      .getPublicUrl(selectedFile.name);
    window.open(data.publicUrl, '_blank');
  };

  return (
    <RoleGate require="superadmin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Media Gallery</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage all uploaded media files. Delete unused files to free up storage.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={filesLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary hover:bg-accent text-sm"
          >
            <RefreshCw className={`size-4 ${filesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Bucket Selector */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">Bucket:</label>
          <select
            value={selectedBucket}
            onChange={(e) => {
              setSelectedBucket(e.target.value);
              setSelectedFile(null);
            }}
            className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
          >
            {bucketsLoading ? (
              <option>Loading buckets...</option>
            ) : buckets?.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.name} {bucket.public ? '(Public)' : '(Private)'}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm"
          />
        </div>

        {/* Files Grid */}
        {filesLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <RefreshCw className="size-8 mx-auto mb-3 animate-spin" />
            <p>Loading files...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <HardDrive className="size-8 mx-auto mb-3 opacity-30" />
            <p>No files found in this bucket.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredFiles.map((file) => (
              <div
                key={file.name}
                onClick={() => setSelectedFile(file)}
                className={`group relative aspect-square rounded-lg overflow-hidden bg-secondary border-2 cursor-pointer transition-all ${
                  selectedFile?.name === file.name
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {/* Preview */}
                {file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                  <img
                    src={`https://wesuplusly.supabase.co/storage/v1/object/public/${file.bucket_id}/${file.name}`}
                    alt={file.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    {getFileIcon(file.name)}
                  </div>
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="text-center text-white">
                    <p className="text-xs font-medium truncate px-2">{file.name}</p>
                    <p className="text-xs text-white/70 mt-1">{formatFileSize(file.size)}</p>
                  </div>
                </div>

                {/* Selected indicator */}
                {selectedFile?.name === file.name && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <X className="size-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* File Details Panel */}
        {selectedFile && (
          <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 md:p-6 z-50">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center">
                  {getFileIcon(selectedFile.name)}
                </div>
                <div>
                  <h3 className="font-semibold">{selectedFile.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(selectedFile.size)} • {selectedFile.bucket_id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uploaded: {new Date(selectedFile.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-accent text-sm"
                >
                  <Download className="size-4" />
                  Download
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteM.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                  {deleteM.isPending ? "Deleting..." : "Delete"}
                </button>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-accent text-sm"
                >
                  <X className="size-4" />
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertTriangle className="size-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-yellow-500">Warning</p>
            <p className="text-muted-foreground mt-1">
              Deleting files is permanent. Make sure the file is not being used by any songs, albums, or hero slides before deleting.
            </p>
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
