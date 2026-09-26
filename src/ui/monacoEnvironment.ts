import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

/**
 * The lyric pad only needs plain-text editing, not a language service, so the
 * generic editor worker is the only one registered. Vite's `?worker` suffix
 * bundles it locally -- no CDN fetch, matching the rest of the app.
 */
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};
