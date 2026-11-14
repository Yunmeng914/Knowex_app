# Reader capabilities

Knowex follows established document-reader interaction patterns while keeping its own PDF.js-based implementation and local Markdown storage model. Zotero's reader source is AGPLv3, so it is not copied into this MIT-licensed repository.

## Available in 0.4

- paged and continuous scrolling;
- mouse-wheel/trackpad scrolling and Ctrl/pinch zoom anchored at the pointer;
- actual size, fit width, and fit height;
- horizontal and vertical split view with an independently navigable second pane;
- original, sepia, and dark page themes;
- thumbnails, annotation list, PDF outline, and document-wide search;
- current-page read-aloud and read-aloud from a selected passage;
- selection popup with eight colors and highlight/underline choice;
- locked highlight and underline modes with a persistent color picker;
- positioned page notes and rectangular screenshot annotations;
- reader context menu for copy, speech, zoom, fit, split, and paging;
- `H`, `U`, `Page Up`, `Page Down`, and `Esc` keyboard controls.
- fuzzy document search with highlighted result excerpts and PDF text-layer matches;
- Zotero parent-item titles, optional note/annotation import, and confirmed child-note export;
- AI chat grounded in either a screenshot or selected-text annotation.

All annotation types share the same normalized page anchors, local index, editing panel, tags, and Markdown output. The source PDF remains unchanged.

## Compatibility backlog

“Everything Zotero can do” is a long-term compatibility target, not a single release boundary. The following reader features are not represented as complete in 0.4:

- ink/freehand drawing and editable text-box annotations;
- importing, embedding, or exporting standard PDF annotations;
- multi-page selections, annotation resizing, and page rotation/deletion;
- citation/reference hover previews and internal-link history;
- advanced read-aloud voices, sentence navigation, and speech-synchronized annotations;
- printing, presentation mode, spreads, and complete keyboard/accessibility parity;
- EPUB and saved-webpage reading;
- note-editor citation workflows, native PDF-annotation write-back, and direct Zotero database access.

These items should be implemented as independent reader modules and validated one feature group at a time. Current Zotero export is deliberately limited to one user-confirmed child note through the official Web API.
