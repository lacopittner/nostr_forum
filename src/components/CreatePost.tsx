import { useEffect, useMemo, useRef, useState } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import {
  Send,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  X,
  Maximize2,
  Minimize2,
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Eye,
  Edit2,
  ChevronDown,
} from "lucide-react";
import { useNostr } from "../providers/NostrProvider";
import { useToast } from "../lib/toast";
import { useRateLimit } from "../hooks/useRateLimit";
import { logger } from "../lib/logger";
import { publishWithRelayFailover } from "../lib/publish";
import { FlairSelector } from "./FlairSelector";
import { ImageUpload } from "./ImageUpload";
import { MarkdownContent } from "./MarkdownContent";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const COMMUNITY_APPROVAL_KIND = 4550;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DRAFT_SAVE_DEBOUNCE_MS = 1000;

interface StoredPostDraft {
  content: string;
  selectedCommunityAtag?: string;
  savedAt: number;
  expiresAt: number;
}

interface PostCommunityTarget {
  pubkey: string;
  id: string;
  name: string;
  atag: string;
  flairs?: string[];
  isClosed?: boolean;
  isModerator?: boolean;
}

interface CreatePostProps {
  community?: PostCommunityTarget;
  communities?: PostCommunityTarget[];
  isModerator?: boolean;
  onPostCreated?: () => void;
}

export function CreatePost({ community, communities, isModerator = false, onPostCreated }: CreatePostProps) {
  const { ndk, user, requireSigner } = useNostr();
  const { success, error: showError } = useToast();
  const [content, setContent] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [selectedCommunityAtag, setSelectedCommunityAtag] = useState<string>(
    community?.atag || ""
  );
  const [selectedFlair, setSelectedFlair] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [isHeadingMenuOpen, setIsHeadingMenuOpen] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement>(null);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const draftRestoredRef = useRef(false);

  const { checkRateLimit } = useRateLimit("posting", {
    maxAttempts: 3,
    windowMs: 60000,
    cooldownMs: 30000,
  });

  const isInCommunityPage = !!community;
  const selectedCommunity = isInCommunityPage
    ? community
    : communities?.find((c) => c.atag === selectedCommunityAtag);
  const selectedCommunityIsClosed = Boolean(selectedCommunity?.isClosed);
  const selectedCommunityUserIsModerator = isInCommunityPage
    ? isModerator
    : Boolean(selectedCommunity?.isModerator);
  const cannotPostInSelectedCommunity = Boolean(
    user &&
      selectedCommunity &&
      selectedCommunityIsClosed &&
      !selectedCommunityUserIsModerator
  );
  const canPublish = Boolean(
    user &&
      content.trim() &&
      selectedCommunity &&
      !cannotPostInSelectedCommunity
  );
  const hasWritableCommunity = Boolean(
    communities?.some((item) => !item.isClosed || item.isModerator)
  );
  const draftStorageKey = useMemo(
    () => `nostr_forum:create_post_draft:${user?.pubkey || "guest"}`,
    [user?.pubkey]
  );
  const draftExpiryHint = useMemo(() => {
    if (!draftSavedAt) return null;
    const msLeft = draftSavedAt + DRAFT_TTL_MS - Date.now();
    if (msLeft <= 0) return "Draft expired.";
    const daysLeft = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return `Draft will be deleted in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`;
  }, [draftSavedAt]);

  useEffect(() => {
    if (user && selectedCommunityIsClosed && !selectedCommunityUserIsModerator) {
      setPostError("Only moderators can post in this community");
    } else {
      setPostError(null);
    }
  }, [user, selectedCommunityIsClosed, selectedCommunityUserIsModerator]);

  const availableFlairs = selectedCommunity?.flairs || [];

  useEffect(() => {
    draftRestoredRef.current = false;
  }, [draftStorageKey]);

  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (typeof window === "undefined") return;

    draftRestoredRef.current = true;
    const rawDraft = localStorage.getItem(draftStorageKey);
    if (!rawDraft) return;

    try {
      const parsed = JSON.parse(rawDraft) as StoredPostDraft;
      if (!parsed || typeof parsed !== "object") return;

      if (!parsed.expiresAt || parsed.expiresAt < Date.now()) {
        localStorage.removeItem(draftStorageKey);
        return;
      }

      if (parsed.content) {
        setContent(parsed.content);
      }

      if (!isInCommunityPage && parsed.selectedCommunityAtag) {
        setSelectedCommunityAtag(parsed.selectedCommunityAtag);
      }

      if (parsed.savedAt) {
        setDraftSavedAt(parsed.savedAt);
      }
    } catch {
      localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, isInCommunityPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const shouldClearDraft = !content.trim() && imageUrls.length === 0;
    if (shouldClearDraft) {
      localStorage.removeItem(draftStorageKey);
      setDraftSavedAt(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now();
      const draft: StoredPostDraft = {
        content,
        selectedCommunityAtag: isInCommunityPage ? community?.atag : selectedCommunityAtag,
        savedAt: now,
        expiresAt: now + DRAFT_TTL_MS,
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      setDraftSavedAt(now);
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    community?.atag,
    content,
    draftStorageKey,
    imageUrls.length,
    isInCommunityPage,
    selectedCommunityAtag,
  ]);

  useEffect(() => {
    if (!isFullscreenEditorOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreenEditorOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreenEditorOpen]);

  useEffect(() => {
    if (isFullscreenEditorOpen && !showMarkdownPreview) {
      requestAnimationFrame(() => {
        fullscreenTextareaRef.current?.focus();
      });
    }
  }, [isFullscreenEditorOpen, showMarkdownPreview]);

  useEffect(() => {
    if (!isHeadingMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!headingMenuRef.current) return;
      if (!headingMenuRef.current.contains(event.target as Node)) {
        setIsHeadingMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isHeadingMenuOpen]);

  const getActiveTextarea = () =>
    isFullscreenEditorOpen ? fullscreenTextareaRef.current : inlineTextareaRef.current;

  const applySelectionTransform = (
    transform: (
      value: string,
      start: number,
      end: number,
      selectedText: string
    ) => { nextValue: string; nextEnd: number }
  ) => {
    const textarea = getActiveTextarea();
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const selectedText = content.slice(start, end);
    const { nextValue, nextEnd } = transform(content, start, end, selectedText);

    setContent(nextValue);

    requestAnimationFrame(() => {
      const activeTextarea = getActiveTextarea();
      if (!activeTextarea) return;
      activeTextarea.focus();
      activeTextarea.setSelectionRange(nextEnd, nextEnd);
    });
  };

  const applyWrapSyntax = (before: string, after: string, placeholder: string) => {
    applySelectionTransform((value, start, end, selectedText) => {
      const text = selectedText || placeholder;
      const replacement = `${before}${text}${after}`;
      return {
        nextValue: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
        nextEnd: start + before.length + text.length,
      };
    });
  };

  const applyLinePrefix = (prefix: string, placeholder: string) => {
    applySelectionTransform((value, start, end) => {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const nextLineIndex = value.indexOf("\n", end);
      const lineEnd = nextLineIndex === -1 ? value.length : nextLineIndex;
      const selectedBlock = value.slice(lineStart, lineEnd);
      const blockToFormat = selectedBlock || placeholder;
      const prefixedBlock = blockToFormat
        .split("\n")
        .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
        .join("\n");

      return {
        nextValue: `${value.slice(0, lineStart)}${prefixedBlock}${value.slice(lineEnd)}`,
        nextEnd: lineStart + prefixedBlock.length,
      };
    });
  };

  const applyHeading = (level: "paragraph" | "h1" | "h2" | "h3" | "h4") => {
    const headingPrefixByLevel = {
      paragraph: "",
      h1: "# ",
      h2: "## ",
      h3: "### ",
      h4: "#### ",
    } as const;

    const headingPrefix = headingPrefixByLevel[level];

    applySelectionTransform((value, start, end) => {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const nextLineIndex = value.indexOf("\n", end);
      const lineEnd = nextLineIndex === -1 ? value.length : nextLineIndex;
      const selectedBlock = value.slice(lineStart, lineEnd);

      if (!selectedBlock && level === "paragraph") {
        return { nextValue: value, nextEnd: end };
      }

      const blockToFormat = selectedBlock || "Heading";
      const formattedBlock = blockToFormat
        .split("\n")
        .map((line) => {
          const indent = line.match(/^\s*/)?.[0] || "";
          const withoutIndent = line.slice(indent.length);
          const withoutHeading = withoutIndent.replace(/^#{1,6}\s+/, "");

          if (!withoutHeading.trim()) {
            return level === "paragraph"
              ? indent
              : `${indent}${headingPrefix}Heading`;
          }

          return level === "paragraph"
            ? `${indent}${withoutHeading}`
            : `${indent}${headingPrefix}${withoutHeading}`;
        })
        .join("\n");

      return {
        nextValue: `${value.slice(0, lineStart)}${formattedBlock}${value.slice(lineEnd)}`,
        nextEnd: lineStart + formattedBlock.length,
      };
    });

    setIsHeadingMenuOpen(false);
  };

  const insertLink = () => {
    applySelectionTransform((value, start, end, selectedText) => {
      const linkLabel = selectedText || "link text";
      const urlPlaceholder = "https://example.com";
      const replacement = `[${linkLabel}](${urlPlaceholder})`;
      const urlStart = start + linkLabel.length + 3;
      return {
        nextValue: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
        nextEnd: urlStart + urlPlaceholder.length,
      };
    });
  };

  const markdownActions = [
    { label: "Bold", icon: Bold, onClick: () => applyWrapSyntax("**", "**", "bold text"), title: "Bold" },
    { label: "Italic", icon: Italic, onClick: () => applyWrapSyntax("*", "*", "italic text"), title: "Italic" },
    { label: "Bullets", icon: List, onClick: () => applyLinePrefix("- ", "List item"), title: "Bulleted list" },
    { label: "Numbers", icon: ListOrdered, onClick: () => applyLinePrefix("1. ", "List item"), title: "Numbered list" },
    { label: "Quote", icon: Quote, onClick: () => applyLinePrefix("> ", "Quoted text"), title: "Quote" },
    { label: "Code", icon: Code, onClick: () => applyWrapSyntax("`", "`", "code"), title: "Inline code" },
    { label: "Link", icon: LinkIcon, onClick: insertLink, title: "Link" },
  ];

  const insertAtCaret = (textarea: HTMLTextAreaElement, insertText: string) => {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}${insertText}${value.slice(end)}`;
    const nextCursor = start + insertText.length;

    setContent(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    const textarea = event.currentTarget;
    const { value, selectionStart, selectionEnd } = textarea;
    if (selectionStart !== selectionEnd) return;

    const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const nextLineBreak = value.indexOf("\n", selectionStart);
    const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const beforeCursor = value.slice(lineStart, selectionStart);
    const afterCursor = value.slice(selectionStart, lineEnd);

    const unorderedMatch = beforeCursor.match(/^(\s*)([-*+])\s(.*)$/);
    if (unorderedMatch) {
      event.preventDefault();
      const [, indent, bullet, itemText] = unorderedMatch;
      const isEmptyListItem = itemText.trim().length === 0 && afterCursor.trim().length === 0;
      insertAtCaret(textarea, isEmptyListItem ? "\n" : `\n${indent}${bullet} `);
      return;
    }

    const orderedMatch = beforeCursor.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (orderedMatch) {
      event.preventDefault();
      const [, indent, orderNumber, itemText] = orderedMatch;
      const isEmptyListItem = itemText.trim().length === 0 && afterCursor.trim().length === 0;
      const nextNumber = Number(orderNumber) + 1;
      insertAtCaret(textarea, isEmptyListItem ? "\n" : `\n${indent}${nextNumber}. `);
    }
  };

  const handleImageUploaded = (url: string) => {
    setImageUrls((prev) => [...prev, url]);
    setShowImageUpload(false);
  };

  const handleRemoveImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublish = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || !user || isPublishing) return;

    if (!selectedCommunity) {
      setPostError("Select a community to post.");
      showError("Select a community to post.");
      return;
    }

    if (selectedCommunityIsClosed && !selectedCommunityUserIsModerator) {
      setPostError("Only moderators can post in this community");
      showError("Only moderators can post in this community");
      return;
    }

    if (!checkRateLimit()) return;

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      setPostError("Signing capability required. Please unlock with PIN.");
      setIsPublishing(false);
      return;
    }

    setIsPublishing(true);
    setPostError(null);

    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;

      // Build content with images
      let finalContent = trimmedContent;
      if (imageUrls.length > 0) {
        finalContent += "\n\n" + imageUrls.join("\n");
      }
      event.content = finalContent;

      // Build tags
      const tags: string[][] = [];

      tags.push(["a", selectedCommunity.atag]);
      tags.push(["t", selectedCommunity.name.toLowerCase()]);

      // Add flair if selected
      if (selectedFlair) {
        tags.push(["flair", selectedFlair]);
      }

      event.tags = tags;
      await publishWithRelayFailover(event);

      if (selectedCommunityIsClosed && selectedCommunityUserIsModerator) {
        const approval = new NDKEvent(ndk);
        approval.kind = COMMUNITY_APPROVAL_KIND as any;
        approval.content = "approved";
        approval.tags = [
          ["a", selectedCommunity.atag],
          ["e", event.id],
          ["p", event.pubkey],
          ["status", "approved"],
        ];
        await publishWithRelayFailover(approval);
      }

      // Reset form
      setContent("");
      setSelectedFlair(null);
      setImageUrls([]);
      setShowImageUpload(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem(draftStorageKey);
      }
      setDraftSavedAt(null);

      success("Post published successfully!");
      onPostCreated?.();
    } catch (error) {
      logger.error("Failed to publish post:", error);
      setPostError("Failed to publish post. Check your relay connection.");
      showError("Failed to publish post. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const placeholder = isInCommunityPage
    ? "Share something with this community..."
    : "What's on your mind?";

  const buttonText = isPublishing
    ? "Posting..."
    : isInCommunityPage
    ? "Post"
    : "Post to Community";

  const openFullscreenEditor = () => {
    setShowMarkdownPreview(false);
    setIsHeadingMenuOpen(false);
    setIsFullscreenEditorOpen(true);
  };

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm">
      {postError && (
        <div className="mb-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle size={16} />
          <span>{postError}</span>
        </div>
      )}

      {/* Community selector - only shown on homepage */}
      {!isInCommunityPage && (
        <div className="mb-3">
          <label className="block text-xs font-bold text-muted-foreground mb-1">
            Community
          </label>
          <select
            value={selectedCommunityAtag}
            onChange={(e) => {
              setSelectedCommunityAtag(e.target.value);
              setSelectedFlair(null); // Reset flair when changing community
              setPostError(null);
            }}
            disabled={!communities || communities.length === 0}
            className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50"
          >
            <option value="">Select a community</option>
            {communities?.map((c) => (
              <option
                key={c.atag}
                value={c.atag}
                disabled={Boolean(c.isClosed && !c.isModerator)}
              >
                {c.name}
                {c.isClosed && !c.isModerator ? " (moderators only)" : ""}
              </option>
            ))}
          </select>
          {(!communities || communities.length === 0) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Join a community to post.
            </p>
          )}
          {communities && communities.length > 0 && !hasWritableCommunity && (
            <p className="mt-1 text-xs text-amber-500">
              You are not a moderator in any joined closed community.
            </p>
          )}
        </div>
      )}

      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setShowMarkdownPreview((prev) => !prev)}
          type="button"
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${
            showMarkdownPreview
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "bg-accent/60 text-foreground hover:bg-accent"
          }`}
        >
          {showMarkdownPreview ? <Edit2 size={12} /> : <Eye size={12} />}
          {showMarkdownPreview ? "Write" : "Preview"}
        </button>
      </div>

      {/* Text area / preview */}
      {showMarkdownPreview ? (
        <div className="w-full bg-accent/30 rounded-lg p-3 min-h-[120px] border border-border/60">
          {content.trim() ? (
            <MarkdownContent content={content} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={inlineTextareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleEditorKeyDown}
          placeholder={placeholder}
          className="w-full bg-accent/50 border-none rounded-lg p-3 text-sm focus:ring-1 focus:ring-[var(--primary)] min-h-[120px] resize-y overflow-auto"
        />
      )}

      {(draftSavedAt || draftExpiryHint) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {draftSavedAt && (
            <span className="rounded-full bg-accent/50 px-2 py-0.5 font-semibold">
              Draft saved
            </span>
          )}
          {draftExpiryHint && <span>{draftExpiryHint}</span>}
        </div>
      )}

      {/* Image previews */}
      {imageUrls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {imageUrls.map((url, idx) => (
            <div key={idx} className="relative group">
              <img
                src={url}
                alt={`Upload ${idx + 1}`}
                className="h-24 w-24 object-cover rounded-lg border border-border"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";
                }}
              />
              <button
                onClick={() => handleRemoveImage(idx)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image upload */}
      {showImageUpload && (
        <div className="mt-3">
          <ImageUpload
            onImageUploaded={handleImageUploaded}
            onCancel={() => setShowImageUpload(false)}
          />
        </div>
      )}

      {/* Action bar */}
      <div className="mt-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          {/* Image toggle button */}
          <button
            onClick={() => setShowImageUpload(!showImageUpload)}
            type="button"
            className={`flex items-center space-x-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${
              showImageUpload
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <ImageIcon size={16} />
            <span>Image</span>
          </button>

          <button
            onClick={openFullscreenEditor}
            type="button"
            className="flex items-center space-x-2 px-4 py-2 rounded-full font-bold text-sm transition-all text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Open full screen editor"
          >
            <Maximize2 size={16} />
            <span className="hidden sm:inline">Full screen</span>
          </button>

          {/* Flair selector - shown when community has flairs */}
          <FlairSelector
            flairs={availableFlairs}
            selectedFlair={selectedFlair}
            onSelect={setSelectedFlair}
            compact
          />
        </div>

        <button
          onClick={handlePublish}
          disabled={
            isPublishing ||
            !canPublish
          }
          className="flex items-center space-x-2 px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-bold text-sm hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all"
        >
          {isPublishing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          <span>{buttonText}</span>
        </button>
      </div>

      {isFullscreenEditorOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 p-3 sm:p-6">
          <div className="mx-auto flex h-full max-w-5xl flex-col rounded-xl border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <div>
                <h3 className="text-lg font-black">Full Screen Editor</h3>
                <p className="text-xs text-muted-foreground">
                  Markdown supported. Select text and use the toolbar buttons.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMarkdownPreview((prev) => !prev)}
                  type="button"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                    showMarkdownPreview
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-accent/60 text-foreground hover:bg-accent"
                  }`}
                >
                  {showMarkdownPreview ? <Edit2 size={16} /> : <Eye size={16} />}
                  <span>{showMarkdownPreview ? "Edit" : "Preview"}</span>
                </button>
                <button
                  onClick={() => setIsFullscreenEditorOpen(false)}
                  type="button"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-accent/60 text-foreground hover:bg-accent transition-all"
                >
                  <Minimize2 size={16} />
                  <span className="hidden sm:inline">Exit</span>
                </button>
              </div>
            </div>

            {!showMarkdownPreview && (
              <div className="space-y-3 border-b border-border px-4 py-3 sm:px-6">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowImageUpload((prev) => !prev)}
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                    title="Add image"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                      showImageUpload
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "bg-accent/60 hover:bg-accent text-foreground"
                    }`}
                  >
                    <ImageIcon size={15} />
                    <span className="hidden sm:inline">Image</span>
                  </button>

                  <div className="relative" ref={headingMenuRef}>
                    <button
                      onClick={() => setIsHeadingMenuOpen((prev) => !prev)}
                      onMouseDown={(event) => event.preventDefault()}
                      type="button"
                      title="Heading style"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-sm transition-all"
                    >
                      <Heading2 size={15} />
                      <span className="hidden sm:inline">Heading</span>
                      <ChevronDown size={14} />
                    </button>

                    {isHeadingMenuOpen && (
                      <div className="absolute left-0 z-20 mt-1 w-40 rounded-lg border border-border bg-card shadow-lg p-1">
                        <button
                          onClick={() => applyHeading("paragraph")}
                          onMouseDown={(event) => event.preventDefault()}
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                        >
                          Paragraph
                        </button>
                        <button
                          onClick={() => applyHeading("h1")}
                          onMouseDown={(event) => event.preventDefault()}
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                        >
                          H1
                        </button>
                        <button
                          onClick={() => applyHeading("h2")}
                          onMouseDown={(event) => event.preventDefault()}
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                        >
                          H2
                        </button>
                        <button
                          onClick={() => applyHeading("h3")}
                          onMouseDown={(event) => event.preventDefault()}
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                        >
                          H3
                        </button>
                        <button
                          onClick={() => applyHeading("h4")}
                          onMouseDown={(event) => event.preventDefault()}
                          type="button"
                          className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                        >
                          H4
                        </button>
                      </div>
                    )}
                  </div>

                  {markdownActions.map(({ label, icon: Icon, onClick, title }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      onMouseDown={(event) => event.preventDefault()}
                      type="button"
                      title={title}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-sm transition-all"
                    >
                      <Icon size={15} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>

                {showImageUpload && (
                  <div className="max-w-xl">
                    <ImageUpload
                      onImageUploaded={handleImageUploaded}
                      onCancel={() => setShowImageUpload(false)}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-hidden p-4 sm:p-6">
              {showMarkdownPreview ? (
                <div className="h-full overflow-y-auto rounded-lg border border-border bg-accent/20 p-4">
                  {content.trim() ? (
                    <div className="[&_.prose]:max-w-none">
                      <MarkdownContent content={content} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                  )}
                </div>
              ) : (
                <textarea
                  ref={fullscreenTextareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  placeholder={placeholder}
                  className="h-full min-h-[50vh] w-full rounded-lg border border-border bg-accent/40 p-4 text-sm font-mono focus:ring-1 focus:ring-[var(--primary)] resize-y"
                />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
              <p className="text-xs text-muted-foreground">
                Tip: Use `#` headings, `-` lists, and fenced code blocks for markdown formatting.
              </p>
              <button
                onClick={handlePublish}
                disabled={isPublishing || !canPublish}
                className="flex items-center space-x-2 px-5 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-bold text-sm hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all"
              >
                {isPublishing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                <span>{buttonText}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
