import { onScopeDispose, ref } from "vue";
import type { CSVDownload } from "../lib/api/classes/reports";

export function downloadCSV({ blob, filename }: CSVDownload) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

/** Own one export request, independently of dashboard loading/search state. */
export function useCSVExport(save: (file: CSVDownload) => void = downloadCSV) {
  const loading = ref(false);
  const failed = ref(false);
  let controller: AbortController | undefined;
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    controller?.abort();
    loading.value = false;
  });

  async function run(request: (signal: AbortSignal) => Promise<CSVDownload>) {
    if (loading.value || disposed) return;
    loading.value = true;
    failed.value = false;
    controller = new AbortController();
    try {
      const file = await request(controller.signal);
      if (!disposed) save(file);
    } catch {
      if (!disposed) failed.value = true;
    } finally {
      controller = undefined;
      loading.value = false;
    }
  }

  return { loading, failed, run };
}
