import { useNostr } from "../providers/NostrProvider";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useCallback } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowBigUp,
  ArrowBigDown,
  MessageSquare,
  Send,
  AlertCircle,
  Loader2,
  MoreHorizontal,
  Share2,
  Trash2,
  Edit3,
  UserX,
  HelpCircle,
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
import { CommentThread } from "../components/CommentThread";
import { useVoting } from "../hooks/useVoting";
import { useGlobalBlocks } from "../hooks/useGlobalBlocks";
import { PostContent } from "../components/PostContent";
import { ZapButton } from "../components/ZapButton";
import { SavePostButton } from "../components/SavePostButton";
import { ImageUpload } from "../components/ImageUpload";
import { MarkdownContent } from "../components/MarkdownContent";
import { logger } from "../lib/logger";
import { useToast } from "../lib/toast";

interface Comment {
  event: NDKEvent;
  replies: Comment[];
}

export function PostDetailPage() {
  const { ndk, user, requireSigner } = useNostr();
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const {
    isBlocked,
    isEventMuted,
    isEventIdMuted,
    blockUser,
    unblockUser,
    muteEvent,
    unmuteEvent,
  } = useGlobalBlocks();
  
  const [post, setPost] = useState<NDKEvent | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"new" | "top">("new");
  const [replyError, setReplyError] = useState<string | null>(null);
  
  // Reply state
  const [replyContent, setReplyContent] = useState("");
  const [replyImageUrls, setReplyImageUrls] = useState<string[]>([]);
  const [showReplyImageUpload, setShowReplyImageUpload] = useState(false);
  const [isCommentFullscreenOpen, setIsCommentFullscreenOpen] = useState(false);
  const [showCommentMarkdownPreview, setShowCommentMarkdownPreview] = useState(false);
  const [isCommentHeadingMenuOpen, setIsCommentHeadingMenuOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fullscreenReplyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const commentHeadingMenuRef = useRef<HTMLDivElement>(null);
  
  // Voting - use the custom hook instead of duplicating logic
  const { reactions, userVotes, votingIds, error: votingError, handleReaction, processIncomingReaction, processIncomingDeletion } = useVoting();
  
  // Profile fetching
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const profileFetchQueue = useRef(new Set<string>());
  
  const seenEventIds = useRef(new Set<string>());
  const commentsMap = useRef(new Map<string, NDKEvent>());

  const isRedditLikeCommentEvent = useCallback((event: NDKEvent, rootPostId: string): boolean => {
    const rootTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "root");
    if (rootTag) return rootTag[1] === rootPostId;

    // Backward compatibility for old comments without NIP-10 markers.
    const hasThreadMarker = event.tags.some(
      (tag) => tag[0] === "e" && (tag[3] === "root" || tag[3] === "reply")
    );
    if (hasThreadMarker) return false;

    return event.tags.some((tag) => tag[0] === "e" && tag[1] === rootPostId);
  }, []);

  const fetchProfile = useCallback(async (pubkey: string) => {
    if (profiles[pubkey] || profileFetchQueue.current.has(pubkey)) return;
    profileFetchQueue.current.add(pubkey);
    
    try {
      const profile = await ndk.getUser({ pubkey }).fetchProfile();
      if (profile) {
        setProfiles(prev => ({ ...prev, [pubkey]: profile }));
      }
    } catch (e) {
      logger.error("Failed to fetch profile:", pubkey, e);
      // Silently fail - user pubkey will be displayed instead
    }
  }, [ndk, profiles]);



  // Fetch post
  useEffect(() => {
    if (!postId) return;
    
    const fetchPost = async () => {
      try {
        const fetchedPost = await ndk.fetchEvent({ ids: [postId] });
        if (fetchedPost) {
          setPost(fetchedPost);
          fetchProfile(fetchedPost.pubkey);
        }
      } catch (error) {
        logger.error("Failed to fetch post", error); showError("Failed to load post. Please try again.");
      }
    };

    fetchPost();
  }, [ndk, postId, fetchProfile]);

  // Fetch comments and reactions
  useEffect(() => {
    if (!postId) return;

    setIsLoading(true);
    commentsMap.current.clear();

    // Fetch comments
    const commentSub = ndk.subscribe(
      { kinds: [NDKKind.Text], "#e": [postId], limit: 200 },
      { closeOnEose: true }
    );

    commentSub.on("event", (event: NDKEvent) => {
      if (isEventMuted(event)) return;
      if (!isRedditLikeCommentEvent(event, postId)) return;
      if (seenEventIds.current.has(event.id)) return;
      seenEventIds.current.add(event.id);
      
      commentsMap.current.set(event.id, event);
      fetchProfile(event.pubkey);
      
      // Subscribe to reactions for this comment
      ndk.subscribe(
        { kinds: [NDKKind.Reaction], "#e": [event.id] },
        { closeOnEose: true }
      ).on("event", (reactionEvent: NDKEvent) => {
        processIncomingReaction(reactionEvent);
      });
      
      // Subscribe to deletion events
      ndk.subscribe(
        { kinds: [5], "#e": [event.id] },
        { closeOnEose: true }
      ).on("event", (deletionEvent: NDKEvent) => {
        processIncomingDeletion(deletionEvent);
      });
    });

    commentSub.on("eose", () => {
      buildCommentTree();
      setIsLoading(false);
    });

    // Fetch post reactions
    ndk.subscribe(
      { kinds: [NDKKind.Reaction], "#e": [postId] },
      { closeOnEose: true }
    ).on("event", (event: NDKEvent) => {
      processIncomingReaction(event);
    });

    return () => {
      commentSub.stop();
    };
  }, [ndk, postId, fetchProfile, processIncomingReaction, processIncomingDeletion, isEventMuted, isRedditLikeCommentEvent]);

  const buildCommentTree = () => {
    const commentList = Array.from(commentsMap.current.values());
    const commentMap = new Map<string, Comment>();
    
    // Create Comment objects
    commentList.forEach(event => {
      commentMap.set(event.id, { event, replies: [] });
    });
    
    const rootComments: Comment[] = [];
    
    // Build tree structure
    commentList.forEach(event => {
      const comment = commentMap.get(event.id)!;
      
      // Find parent
      const replyTag = event.tags.find(t => t[0] === "e" && t[3] === "reply");
      const parentId = replyTag?.[1];
      
      if (parentId && commentMap.has(parentId)) {
        const parent = commentMap.get(parentId)!;
        parent.replies.push(comment);
      } else {
        rootComments.push(comment);
      }
    });
    
    // Sort based on selected option
    const sortedComments = sortComments(rootComments, sortBy);
    setComments(sortedComments);
  };

  const sortComments = (commentList: Comment[], sort: "new" | "top"): Comment[] => {
    return commentList.sort((a, b) => {
      if (sort === "new") {
        return (b.event.created_at || 0) - (a.event.created_at || 0);
      } else {
        // Sort by score (top)
        const scoreA = reactions[a.event.id] || 0;
        const scoreB = reactions[b.event.id] || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b.event.created_at || 0) - (a.event.created_at || 0);
      }
    }).map(comment => ({
      ...comment,
      replies: sortComments(comment.replies, sort)
    }));
  };

  useEffect(() => {
    buildCommentTree();
  }, [sortBy, reactions]);

  useEffect(() => {
    if (commentsMap.current.size === 0) return;

    for (const [id, event] of commentsMap.current.entries()) {
      if (isEventMuted(event)) {
        commentsMap.current.delete(id);
      }
    }

    buildCommentTree();
  }, [isEventMuted]);

  useEffect(() => {
    if (!isCommentFullscreenOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCommentFullscreenOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCommentFullscreenOpen]);

  useEffect(() => {
    if (isCommentFullscreenOpen && !showCommentMarkdownPreview) {
      requestAnimationFrame(() => {
        fullscreenReplyTextareaRef.current?.focus();
      });
    }
  }, [isCommentFullscreenOpen, showCommentMarkdownPreview]);

  useEffect(() => {
    if (!isCommentHeadingMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!commentHeadingMenuRef.current) return;
      if (!commentHeadingMenuRef.current.contains(event.target as Node)) {
        setIsCommentHeadingMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCommentHeadingMenuOpen]);

  const getActiveCommentTextarea = () =>
    isCommentFullscreenOpen ? fullscreenReplyTextareaRef.current : replyTextareaRef.current;

  const applyCommentSelectionTransform = (
    transform: (
      value: string,
      start: number,
      end: number,
      selectedText: string
    ) => { nextValue: string; nextEnd: number }
  ) => {
    const textarea = getActiveCommentTextarea();
    const start = textarea?.selectionStart ?? replyContent.length;
    const end = textarea?.selectionEnd ?? replyContent.length;
    const selectedText = replyContent.slice(start, end);
    const { nextValue, nextEnd } = transform(replyContent, start, end, selectedText);

    setReplyContent(nextValue);

    requestAnimationFrame(() => {
      const activeTextarea = getActiveCommentTextarea();
      if (!activeTextarea) return;
      activeTextarea.focus();
      activeTextarea.setSelectionRange(nextEnd, nextEnd);
    });
  };

  const applyCommentWrapSyntax = (before: string, after: string, placeholder: string) => {
    applyCommentSelectionTransform((value, start, end, selectedText) => {
      const text = selectedText || placeholder;
      const replacement = `${before}${text}${after}`;
      return {
        nextValue: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
        nextEnd: start + before.length + text.length,
      };
    });
  };

  const applyCommentLinePrefix = (prefix: string, placeholder: string) => {
    applyCommentSelectionTransform((value, start, end) => {
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

  const applyCommentHeading = (level: "paragraph" | "h1" | "h2" | "h3" | "h4") => {
    const headingPrefixByLevel = {
      paragraph: "",
      h1: "# ",
      h2: "## ",
      h3: "### ",
      h4: "#### ",
    } as const;

    const headingPrefix = headingPrefixByLevel[level];

    applyCommentSelectionTransform((value, start, end) => {
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

    setIsCommentHeadingMenuOpen(false);
  };

  const insertCommentLink = () => {
    applyCommentSelectionTransform((value, start, end, selectedText) => {
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

  const commentMarkdownActions = [
    { label: "Bold", icon: Bold, onClick: () => applyCommentWrapSyntax("**", "**", "bold text"), title: "Bold" },
    { label: "Italic", icon: Italic, onClick: () => applyCommentWrapSyntax("*", "*", "italic text"), title: "Italic" },
    { label: "Bullets", icon: List, onClick: () => applyCommentLinePrefix("- ", "List item"), title: "Bulleted list" },
    { label: "Numbers", icon: ListOrdered, onClick: () => applyCommentLinePrefix("1. ", "List item"), title: "Numbered list" },
    { label: "Quote", icon: Quote, onClick: () => applyCommentLinePrefix("> ", "Quoted text"), title: "Quote" },
    { label: "Code", icon: Code, onClick: () => applyCommentWrapSyntax("`", "`", "code"), title: "Inline code" },
    { label: "Link", icon: LinkIcon, onClick: insertCommentLink, title: "Link" },
  ];

  const insertReplyAtCaret = (textarea: HTMLTextAreaElement, insertText: string) => {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}${insertText}${value.slice(end)}`;
    const nextCursor = start + insertText.length;

    setReplyContent(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleCommentEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
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
      insertReplyAtCaret(textarea, isEmptyListItem ? "\n" : `\n${indent}${bullet} `);
      return;
    }

    const orderedMatch = beforeCursor.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (orderedMatch) {
      event.preventDefault();
      const [, indent, orderNumber, itemText] = orderedMatch;
      const isEmptyListItem = itemText.trim().length === 0 && afterCursor.trim().length === 0;
      const nextNumber = Number(orderNumber) + 1;
      insertReplyAtCaret(textarea, isEmptyListItem ? "\n" : `\n${indent}${nextNumber}. `);
    }
  };

  const handleReplyImageUploaded = (url: string) => {
    setReplyImageUrls((prev) => [...prev, url]);
    setShowReplyImageUpload(false);
  };

  const handleRemoveReplyImage = (index: number) => {
    setReplyImageUrls((prev) => prev.filter((_, idx) => idx !== index));
  };

  const openCommentFullscreenEditor = () => {
    setShowCommentMarkdownPreview(false);
    setIsCommentHeadingMenuOpen(false);
    setIsCommentFullscreenOpen(true);
  };

  const handleReply = async (parentId?: string, parentPubkey?: string, content?: string) => {
    const replyText = content || replyContent;
    const targetId = parentId || post?.id;
    const targetPubkey = parentPubkey || post?.pubkey;
    
    if (!replyText?.trim() || !user || !post || !targetId || !targetPubkey || isPublishing) return;

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      setReplyError("Signing capability required. Please unlock with PIN.");
      return;
    }

    setIsPublishing(true);
    setReplyError(null);
    
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;

      let finalReplyContent = replyText.trim();
      const shouldAttachMainReplyImages = !content;
      if (shouldAttachMainReplyImages && replyImageUrls.length > 0) {
        finalReplyContent += `\n\n${replyImageUrls.join("\n")}`;
      }
      event.content = finalReplyContent;
      
      // NIP-10 threading: always reference root post
      // NIP-10 compliant threading:
      // - "root" always references the original post
      // - "reply" references the immediate parent (for nested replies)
      event.tags = [
        ["e", post.id, "", "root"],  // Root is always the original post
        ["p", post.pubkey]
      ];
      
      // If replying to a comment (not root), add reply marker
      if (parentId && parentId !== post.id) {
        event.tags.push(["e", parentId, "", "reply"]);
        if (parentPubkey) {
          // Add p tag for parent author if different from root author
          const hasParentPubkey = event.tags.some(t => t[0] === "p" && t[1] === parentPubkey);
          if (!hasParentPubkey) {
            event.tags.push(["p", parentPubkey]);
          }
        }
      }
      
      await event.publish();
      
      if (!content) {
        // Only clear if it's the main reply box
        setReplyContent("");
        setReplyImageUrls([]);
        setShowReplyImageUpload(false);
        setShowCommentMarkdownPreview(false);
      }
      
      // Add to comments immediately
      const newComment: Comment = { event, replies: [] };
      setComments(prev => [newComment, ...prev]);
      
      success("Reply published successfully!");
    } catch (error) {
      logger.error("Failed to publish reply:", error); showError("Failed to publish reply. Please try again.");
      setReplyError("Failed to publish reply. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleVote = (targetId: string, targetPubkey: string, type: "UPVOTE" | "DOWNVOTE") => {
    // Create a synthetic NDKEvent for voting
    const event = new NDKEvent(ndk);
    event.id = targetId;
    event.pubkey = targetPubkey;
    handleReaction(event, type);
  };

  const handleNestedReply = async (parentId: string, parentPubkey: string, content: string) => {
    if (!content.trim() || !user || !post || !parentId || !parentPubkey) return;

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      setReplyError("Signing capability required. Please unlock with PIN.");
      return;
    }

    setIsPublishing(true);
    setReplyError(null);
    
    try {
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Text;
      event.content = content;
      
      // NIP-10 threading
      event.tags = [
        ["e", post.id, "", "root"],
        ["p", post.pubkey],
        ["e", parentId, "", "reply"],
        ["p", parentPubkey]
      ];
      
      await event.publish();
      
      // Refresh comments to show the new reply
      const newComment: Comment = { event, replies: [] };
      setComments(prev => {
        // Add to the correct parent
        const updateReplies = (commentList: Comment[]): Comment[] => {
          return commentList.map(comment => {
            if (comment.event.id === parentId) {
              return { ...comment, replies: [...comment.replies, newComment] };
            }
            if (comment.replies.length > 0) {
              return { ...comment, replies: updateReplies(comment.replies) };
            }
            return comment;
          });
        };
        return updateReplies(prev);
      });
    } catch (error) {
      logger.error("Failed to publish nested reply:", error); showError("Failed to publish reply. Please try again.");
      setReplyError("Failed to publish reply. Check your relay connection.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    
    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      showError("Signing capability required. Please unlock with PIN.");
      return;
    }
    
    try {
      // Create deletion event (Kind 5)
      const deletion = new NDKEvent(ndk);
      deletion.kind = 5;
      deletion.content = "Deleted by author";
      deletion.tags = [["e", commentId]];
      
      await deletion.publish();
      
      // Remove from local state
      const removeComment = (commentList: Comment[]): Comment[] => {
        return commentList
          .filter(c => c.event.id !== commentId)
          .map(c => ({
            ...c,
            replies: removeComment(c.replies)
          }));
      };
      
      setComments(prev => removeComment(prev));
    } catch (error) {
      logger.error("Failed to delete comment", error); showError("Failed to delete comment. Please try again.");
      alert("Failed to delete comment");
    }
  };

  const handleDeletePost = async () => {
    if (!user || !post) return;
    if (post.pubkey !== user.pubkey) {
      showError("You can only delete your own posts");
      return;
    }

    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      showError("Signing capability required. Please unlock with PIN.");
      return;
    }
    
    if (!confirm("Are you sure you want to delete this post?")) return;
    
    try {
      const deletion = new NDKEvent(ndk);
      deletion.kind = 5;
      deletion.content = "Deleted by author";
      deletion.tags = [["e", post.id]];
      
      await deletion.publish();
      success("Post deleted");
      navigate(-1);
    } catch (error) {
      logger.error("Failed to delete post", error);
      showError("Failed to delete post");
    }
  };

  const handleEditPost = async () => {
    if (!user || !post) return;
    if (post.pubkey !== user.pubkey) {
      showError("You can only edit your own posts");
      return;
    }
    
    const trimmedContent = editContent.trim();
    if (!trimmedContent || trimmedContent === post.content.trim()) return;
    
    // Ensure signer is available for signing
    const hasSigner = await requireSigner();
    if (!hasSigner) {
      showError("Signing capability required. Please unlock with PIN.");
      return;
    }
    
    try {
      const deletion = new NDKEvent(ndk);
      deletion.kind = 5;
      deletion.content = "Post replaced by edited version";
      deletion.tags = [["e", post.id]];
      await deletion.publish();

      const replacement = new NDKEvent(ndk);
      replacement.kind = NDKKind.Text;
      replacement.content = trimmedContent;
      replacement.tags = [
        ...post.tags.filter(t => t[0] !== "edited"),
        ["edited", post.id, new Date().toISOString()],
      ];

      await replacement.publish();

      setPost(replacement);
      setIsEditing(false);
      setComments([]);
      commentsMap.current.clear();
      seenEventIds.current.clear();
      success("Post updated");
      navigate(`/post/${replacement.id}`, { replace: true });
    } catch (error) {
      logger.error("Failed to edit post", error);
      showError("Failed to edit post");
    }
  };

  const isOwnPost = user && post && post.pubkey === user.pubkey;
  const isPostAuthorBlocked = post ? isBlocked(post.pubkey) : false;
  const isPostMutedById = post ? isEventIdMuted(post.id) : false;
  const isPostMuted = post ? isEventMuted(post) : false;
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const handleToggleGlobalBlock = async () => {
    if (!post || !user) return;

    const targetPubkey = post.pubkey;
    if (targetPubkey === user.pubkey) {
      showError("You cannot block your own account");
      return;
    }

    if (isBlocked(targetPubkey)) {
      const ok = await unblockUser(targetPubkey);
      if (ok) success("User unblocked globally");
      else showError("Failed to unblock user");
    } else {
      const ok = await blockUser(targetPubkey);
      if (ok) success("User blocked globally");
      else showError("Failed to block user");
    }
  };

  const handleTogglePostMute = async () => {
    if (!post || !user) return;

    const targetPostId = post.id;
    const isMutedById = isEventIdMuted(targetPostId);
    const ok = isMutedById ? await unmuteEvent(targetPostId) : await muteEvent(targetPostId);

    if (!ok) {
      showError(isMutedById ? "Failed to unmute post" : "Failed to mute post");
      return;
    }

    success(isMutedById ? "Post unmuted" : "Post muted");
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    
    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActionsMenu]);

  const getTotalCommentCount = (commentList: Comment[]): number => {
    return commentList.reduce((acc, comment) => {
      return acc + 1 + getTotalCommentCount(comment.replies);
    }, 0);
  };

  if (isLoading && !post) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-400">Loading post...</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
        <p className="text-gray-400 mb-4">Post not found</p>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-bold hover:bg-[var(--primary-dark)]"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (isPostMuted) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <div className="bg-card border rounded-xl p-8 text-center shadow-sm">
          <p className="text-muted-foreground mb-4">
            This post is hidden by your mute settings.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {isPostMutedById && (
              <button
                onClick={() => void handleTogglePostMute()}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-bold hover:bg-[var(--primary-dark)]"
              >
                Unmute Post
              </button>
            )}
            {isPostAuthorBlocked && (
              <button
                onClick={() => void handleToggleGlobalBlock()}
                className="px-4 py-2 bg-accent text-foreground rounded-lg font-bold hover:bg-accent/80"
              >
                Unmute Author
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const totalComments = getTotalCommentCount(comments);
  const replyPreviewContent = replyImageUrls.length > 0
    ? `${replyContent}${replyContent.trim() ? "\n\n" : ""}${replyImageUrls.join("\n")}`
    : replyContent;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center space-x-2 text-[var(--primary)] hover:text-[var(--primary)] transition-colors"
      >
        <ArrowLeft size={20} />
        <span>Back</span>
      </button>

      {/* Post */}
      <div className="bg-card border rounded-xl shadow-sm">
        <div className="flex">
          {/* Voting */}
          <div className="w-12 bg-accent/30 flex flex-col items-center py-4 space-y-1 rounded-l-xl">
            <button
              onClick={() => handleVote(post.id, post.pubkey, "UPVOTE")}
              disabled={votingIds.has(post.id)}
              className={`transition-colors ${userVotes[post.id] === "UPVOTE" ? "text-[var(--primary)]" : "text-muted-foreground hover:text-[var(--primary)]"}`}
            >
              <ArrowBigUp size={24} fill={userVotes[post.id] === "UPVOTE" ? "currentColor" : "none"} />
            </button>
            <span className={`text-[13px] font-black ${userVotes[post.id] === "UPVOTE" ? "text-[var(--primary)]" : userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : ""}`}>
              {reactions[post.id] || 0}
            </span>
            <button
              onClick={() => handleVote(post.id, post.pubkey, "DOWNVOTE")}
              disabled={votingIds.has(post.id)}
              className={`transition-colors ${userVotes[post.id] === "DOWNVOTE" ? "text-blue-600" : "text-muted-foreground hover:text-blue-600"}`}
            >
              <ArrowBigDown size={24} fill={userVotes[post.id] === "DOWNVOTE" ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="p-4 flex-1">
            {/* Post header - metadata with links */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
              {/* Community link */}
              <button 
                onClick={() => navigate('/communities')}
                className="font-bold text-foreground/80 hover:underline hover:text-[var(--primary)]"
              >
                r/nostr
              </button>
              <span>•</span>
              <span>Posted by</span>
              {/* Author link */}
              <button 
                onClick={() => navigate(`/profile/${post.pubkey}`)}
                className="hover:underline hover:text-[var(--primary)] text-foreground/60"
              >
                {profiles[post.pubkey]?.displayName || profiles[post.pubkey]?.name || `${post.pubkey.slice(0, 8)}...`}
              </button>
              <span>•</span>
              <span>{new Date((post.created_at || 0) * 1000).toLocaleString()}</span>
            </div>
            
            {/* Edit mode */}
            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-accent/50 border rounded-lg p-3 text-sm min-h-[150px]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-sm font-bold hover:bg-accent rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditPost}
                    disabled={!editContent.trim()}
                    className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-bold rounded-lg hover:bg-[var(--primary-dark)] disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <PostContent content={post.content} />
                </div>
                
                {/* Action bar */}
                <div className="flex items-center gap-1 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground text-xs font-bold">
                    <MessageSquare size={16} />
                    <span>{totalComments} comments</span>
                  </div>
                  
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      success("Link copied to clipboard");
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground text-xs font-bold"
                  >
                    <Share2 size={16} />
                    <span>Share</span>
                  </button>
                  
                  <div className="flex items-center">
                    <SavePostButton post={post} size="sm" />
                  </div>
                  
                  <div className="flex items-center">
                    <ZapButton 
                      targetPubkey={post.pubkey} 
                      eventId={post.id}
                      size="sm"
                      showText={true}
                    />
                  </div>
                  
                  {/* 3-dot menu moved to bottom right */}
                  <div className="relative ml-auto" ref={actionsMenuRef}>
                    <button
                      onClick={() => setShowActionsMenu(!showActionsMenu)}
                      className="p-1.5 hover:bg-accent rounded-full transition-colors text-muted-foreground"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    
                    {showActionsMenu && (
                      <div className="absolute right-0 bottom-full mb-1 w-40 bg-card border rounded-lg shadow-lg z-10 py-1">
                        {isOwnPost ? (
                          <>
                            <button
                              onClick={() => {
                                setIsEditing(true);
                                setEditContent(post.content);
                                setShowActionsMenu(false);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                            >
                              <Edit3 size={14} />
                              Edit Post
                            </button>
                            <button
                              onClick={() => {
                                handleDeletePost();
                                setShowActionsMenu(false);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-accent text-red-500 flex items-center gap-2"
                            >
                              <Trash2 size={14} />
                              Delete Post
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(window.location.href);
                                success("Link copied to clipboard");
                                setShowActionsMenu(false);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                            >
                              <Share2 size={14} />
                              Share Post
                            </button>
                            <button
                              onClick={() => {
                                alert("Report feature coming soon");
                                setShowActionsMenu(false);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-accent text-muted-foreground"
                            >
                              Report Post
                            </button>
                            <button
                              onClick={() => {
                                void handleTogglePostMute();
                                setShowActionsMenu(false);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-accent text-muted-foreground"
                            >
                              {isPostMutedById ? "Unmute Post" : "Mute Post"}
                            </button>
                            <button
                              onClick={() => {
                                void handleToggleGlobalBlock();
                                setShowActionsMenu(false);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-accent text-red-500 flex items-center gap-2"
                            >
                              <UserX size={14} />
                              {isBlocked(post.pubkey) ? "Unblock User" : "Block User"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Reply Box */}
      {user && (
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          {replyError && (
            <div className="mb-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle size={16} />
              <span>{replyError}</span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <textarea
              ref={replyTextareaRef}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={handleCommentEditorKeyDown}
              placeholder="What are your thoughts?"
              className="flex-1 bg-accent/50 border-none rounded-lg p-3 text-sm focus:ring-1 focus:ring-[var(--primary)] min-h-[120px] resize-y overflow-auto"
            />
            <div className="relative group shrink-0">
              <button
                type="button"
                aria-label="Comment syntax help"
                className="w-8 h-8 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              >
                <HelpCircle size={16} />
              </button>
              <div className="pointer-events-none absolute right-0 top-10 z-10 w-72 rounded-lg border bg-card/95 p-3 text-xs text-muted-foreground shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                Markdown and images are supported. Use full screen for formatting tools.
              </div>
            </div>
          </div>

          {replyImageUrls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {replyImageUrls.map((url, idx) => (
                <div key={`${url}-${idx}`} className="relative group">
                  <img
                    src={url}
                    alt={`Comment upload ${idx + 1}`}
                    className="h-24 w-24 object-cover rounded-lg border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";
                    }}
                  />
                  <button
                    onClick={() => handleRemoveReplyImage(idx)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    type="button"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showReplyImageUpload && (
            <div className="mt-3">
              <ImageUpload
                onImageUploaded={handleReplyImageUploaded}
                onCancel={() => setShowReplyImageUpload(false)}
              />
            </div>
          )}

          <div className="mt-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReplyImageUpload(!showReplyImageUpload)}
                type="button"
                className={`flex items-center space-x-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${
                  showReplyImageUpload
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <ImageIcon size={16} />
                <span>Image</span>
              </button>

              <button
                onClick={openCommentFullscreenEditor}
                type="button"
                className="flex items-center space-x-2 px-4 py-2 rounded-full font-bold text-sm transition-all text-muted-foreground hover:text-foreground hover:bg-accent"
                title="Open full screen editor"
              >
                <Maximize2 size={16} />
                <span className="hidden sm:inline">Full screen</span>
              </button>
            </div>

            <button
              onClick={() => handleReply()}
              disabled={isPublishing || !replyContent.trim()}
              className="flex items-center space-x-2 px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-bold text-sm hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all"
            >
              {isPublishing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Posting...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Comment</span>
                </>
              )}
            </button>
          </div>

          {isCommentFullscreenOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 p-3 sm:p-6">
              <div className="mx-auto flex h-full max-w-5xl flex-col rounded-xl border border-border bg-card shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
                  <div>
                    <h3 className="text-lg font-black">Comment Editor</h3>
                    <p className="text-xs text-muted-foreground">
                      Markdown supported. Select text and use the toolbar buttons.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCommentMarkdownPreview((prev) => !prev)}
                      type="button"
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                        showCommentMarkdownPreview
                          ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : "bg-accent/60 text-foreground hover:bg-accent"
                      }`}
                    >
                      {showCommentMarkdownPreview ? <Edit2 size={16} /> : <Eye size={16} />}
                      <span>{showCommentMarkdownPreview ? "Edit" : "Preview"}</span>
                    </button>
                    <button
                      onClick={() => setIsCommentFullscreenOpen(false)}
                      type="button"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-accent/60 text-foreground hover:bg-accent transition-all"
                    >
                      <Minimize2 size={16} />
                      <span className="hidden sm:inline">Exit</span>
                    </button>
                  </div>
                </div>

                {!showCommentMarkdownPreview && (
                  <div className="space-y-3 border-b border-border px-4 py-3 sm:px-6">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setShowReplyImageUpload((prev) => !prev)}
                        onMouseDown={(event) => event.preventDefault()}
                        type="button"
                        title="Add image"
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                          showReplyImageUpload
                            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "bg-accent/60 hover:bg-accent text-foreground"
                        }`}
                      >
                        <ImageIcon size={15} />
                        <span className="hidden sm:inline">Image</span>
                      </button>

                      <div className="relative" ref={commentHeadingMenuRef}>
                        <button
                          onClick={() => setIsCommentHeadingMenuOpen((prev) => !prev)}
                          onMouseDown={(event) => event.preventDefault()}
                          type="button"
                          title="Heading style"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/60 hover:bg-accent text-foreground text-sm transition-all"
                        >
                          <Heading2 size={15} />
                          <span className="hidden sm:inline">Heading</span>
                          <ChevronDown size={14} />
                        </button>

                        {isCommentHeadingMenuOpen && (
                          <div className="absolute left-0 z-20 mt-1 w-40 rounded-lg border border-border bg-card shadow-lg p-1">
                            <button
                              onClick={() => applyCommentHeading("paragraph")}
                              onMouseDown={(event) => event.preventDefault()}
                              type="button"
                              className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                            >
                              Paragraph
                            </button>
                            <button
                              onClick={() => applyCommentHeading("h1")}
                              onMouseDown={(event) => event.preventDefault()}
                              type="button"
                              className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                            >
                              H1
                            </button>
                            <button
                              onClick={() => applyCommentHeading("h2")}
                              onMouseDown={(event) => event.preventDefault()}
                              type="button"
                              className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                            >
                              H2
                            </button>
                            <button
                              onClick={() => applyCommentHeading("h3")}
                              onMouseDown={(event) => event.preventDefault()}
                              type="button"
                              className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                            >
                              H3
                            </button>
                            <button
                              onClick={() => applyCommentHeading("h4")}
                              onMouseDown={(event) => event.preventDefault()}
                              type="button"
                              className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                            >
                              H4
                            </button>
                          </div>
                        )}
                      </div>

                      {commentMarkdownActions.map(({ label, icon: Icon, onClick, title }) => (
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

                    {showReplyImageUpload && (
                      <div className="max-w-xl">
                        <ImageUpload
                          onImageUploaded={handleReplyImageUploaded}
                          onCancel={() => setShowReplyImageUpload(false)}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 overflow-hidden p-4 sm:p-6">
                  {showCommentMarkdownPreview ? (
                    <div className="h-full overflow-y-auto rounded-lg border border-border bg-accent/20 p-4">
                      {replyPreviewContent.trim() ? (
                        <div className="[&_.prose]:max-w-none">
                          <MarkdownContent content={replyPreviewContent} />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                      )}
                    </div>
                  ) : (
                    <textarea
                      ref={fullscreenReplyTextareaRef}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      onKeyDown={handleCommentEditorKeyDown}
                      placeholder="What are your thoughts?"
                      className="h-full min-h-[50vh] w-full rounded-lg border border-border bg-accent/40 p-4 text-sm font-mono focus:ring-1 focus:ring-[var(--primary)] resize-y"
                    />
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
                  <p className="text-xs text-muted-foreground">
                    Tip: Use `#` headings, `-` lists, and fenced code blocks for markdown formatting.
                  </p>
                  <button
                    onClick={() => handleReply()}
                    disabled={isPublishing || !replyContent.trim()}
                    className="flex items-center space-x-2 px-5 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-bold text-sm hover:bg-[var(--primary-dark)] disabled:opacity-50 transition-all"
                  >
                    {isPublishing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    <span>Comment</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comments Section */}
      <div className="space-y-4">
        {votingError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle size={16} />
            <span>{votingError}</span>
          </div>
        )}
        
        {/* Header with count and sort */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} className="text-gray-400" />
            <span className="font-bold">{totalComments} Comments</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "new" | "top")}
              className="bg-accent/50 border-none rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-[var(--primary)]"
            >
              <option value="new">New</option>
              <option value="top">Top</option>
            </select>
          </div>
        </div>

        {/* Comment Tree */}
        {comments.length === 0 ? (
          <div className="bg-card border rounded-xl p-8 text-center shadow-sm">
            <p className="text-gray-400">No comments yet. Be the first to share your thoughts!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentThread
                key={comment.event.id}
                comment={comment}
                reactions={reactions}
                userVotes={userVotes}
                votingIds={votingIds}
                profiles={profiles}
                onVote={handleVote}
                onReply={(parentId, parentPubkey, content) => {
                  handleNestedReply(parentId, parentPubkey, content);
                }}
                onDelete={handleDeleteComment}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
