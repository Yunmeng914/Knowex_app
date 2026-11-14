# Knowex first-use guide

## 1. Choose a workspace

Choose **Workspace** and select a folder you control. Knowex stores its local index, Markdown notes, and screenshot assets there. Source PDFs are copied or read for display and are not modified by annotation tools.

## 2. Open a document

- Choose **Open File** for a local PDF, PPT, or PPTX.
- Choose **Zotero** for a downloaded PDF attachment in Zotero Desktop.

To connect Zotero locally:

1. Start Zotero Desktop.
2. Open **Edit → Settings → Advanced**.
3. Enable **Allow other applications on this computer to communicate with Zotero**.
4. Return to Knowex and choose **Check Again**.

The Local API is read-only. Knowex never opens `zotero.sqlite`.

## 3. Decide what to sync

Before a Zotero PDF opens, Knowex asks:

- **Import Zotero notes and annotations** — copies existing child notes and PDF annotations into the Knowex workspace and deduplicates them by Zotero item key.
- **Export Knowex annotations** — creates or updates one child note under the Zotero parent item.

Export requires a Zotero user ID and a dedicated Web API key with write access. Configure these under **Settings → Zotero write-back**. Nothing is written unless you select Export and confirm. You can later use the cloud-upload button in the top bar to export new Knowex annotations.

Knowex remembers the first Open and Sync choice as the default, so the dialog does not interrupt every open. Zotero files are grouped under the same nested collections used in Zotero. Right-click a file in that tree to change synchronization for only that file.

## 4. Record evidence

- Select PDF text to create a highlight or underline.
- Choose **Capture Region** to preserve a page image.
- Choose **Page Note** to place a note at any page position.
- Open any annotation in the right sidebar to add a title, comment, tags, or ask AI about its evidence.

Screenshot annotations display their image as an attachment above the chat input. It stays attached across multiple questions until you remove it, and can be attached again without creating another screenshot.

All record types are saved in the workspace and rendered into the document's Markdown file. Moving to another annotation or closing the editor saves the current draft automatically. Deleted annotations can be restored from Trash for 30 days.

Under **Settings → Capture and sync**, you can choose a global shortcut for Knowex's page-region tool and decide whether temporary capture files are cleared when the app exits. The shortcut activates Knowex; it does not replace the Windows screenshot function.

## 5. Search

Open the reader navigation sidebar and choose Search. Exact matches and small spelling variations are supported. Result excerpts and matching PDF text are highlighted. Clearing the query removes search highlights.

The in-app guide appears on first launch and can be reopened from **Help → Getting Started**.
# Optional AI security notes

Configure AI under Settings only if you want annotation-grounded questions. "Configured" does not mean the provider is usable; run the text test for basic calls and the image test separately for screenshots. Model list loading and capability tests may create small provider API requests, but they do not save the connection automatically.

Text requests send the selected annotation text, note, page number, current question, and current annotation chat history. Screenshot requests also send the current screenshot and explicitly attached PNG images. Knowex does not automatically send the whole PDF, other workspace files, the Zotero database, or API keys to the renderer.

If you change the endpoint address or protocol, re-enter the API key. Custom or relay endpoints can receive the API key and annotation content, so confirm the address before saving.
