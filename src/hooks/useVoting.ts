import { useState, useRef, useCallback, useEffect } from "react";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { useNostr } from "../providers/NostrProvider";

interface VotingState {
  reactions: Record<string, number>;
  userVotes: Record<string, "UPVOTE" | "DOWNVOTE" | null>;
  pendingVotes: Set<string>;
}

export function useVoting() {
  const { ndk, user } = useNostr();
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [userVotes, setUserVotes] = useState<Record<string, "UPVOTE" | "DOWNVOTE" | null>>({});
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  
  const reactionMap = useRef<Record<string, Record<string, { id: string; content: string; created_at: number }>>>({});
  const votingLock = useRef(new Set<string>());
  const optimisticQueue = useRef<Array<{ targetId: string; type: "UPVOTE" | "DOWNVOTE" | "UNDO"; resolve: () => void }>>([]);

  const updateScores = useCallback(() => {
    const newScores: Record<string, number> = {};
    const newUserVotes: Record<string, "UPVOTE" | "DOWNVOTE" | null> = {};
    const currentUserPubkey = user?.pubkey;

    for (const [targetId, users] of Object.entries(reactionMap.current)) {
      let score = 0;
      for (const [pubkey, reaction] of Object.entries(users)) {
        if (reaction.content === "NEUTRAL") continue;
        const isDown = reaction.content === "DOWNVOTE" || reaction.content === "-";
        score += isDown ? -1 : 1;
        
        // Check if this reaction is from the current user
        if (currentUserPubkey && pubkey === currentUserPubkey) {
          newUserVotes[targetId] = isDown ? "DOWNVOTE" : "UPVOTE";
        }
      }
      newScores[targetId] = score;
    }
    setReactions(newScores);
    setUserVotes(newUserVotes);
  }, [user?.pubkey]);

  useEffect(() => {
    if (user?.pubkey) {
      updateScores();
    }
  }, [user?.pubkey, updateScores]);

  // Apply optimistic update
  const applyOptimisticUpdate = useCallback((targetId: string, type: "UPVOTE" | "DOWNVOTE" | "UNDO") => {
    setReactions(prev => {
      const current = prev[targetId] || 0;
      if (type === "UNDO") {
        const userVote = userVotes[targetId];
        return { ...prev, [targetId]: current + (userVote === "UPVOTE" ? -1 : userVote === "DOWNVOTE" ? 1 : 0) };
      }
      const change = type === "UPVOTE" ? 1 : -1;
      const undoPrevious = userVotes[targetId] === "UPVOTE" ? -1 : userVotes[targetId] === "DOWNVOTE" ? 1 : 0;
      return { ...prev, [targetId]: current + change + undoPrevious };
    });
    
    setUserVotes(prev => ({ ...prev, [targetId]: type === "UNDO" ? null : type }));
  }, [userVotes]);

  // Revert optimistic update
  const revertOptimisticUpdate = useCallback((targetId: string, originalVote: "UPVOTE" | "DOWNVOTE" | null) => {
    updateScores(); // Recalculate from reactionMap
  }, [updateScores]);

  const handleReaction = async (
    targetEvent: NDKEvent,
    type: "UPVOTE" | "DOWNVOTE"
  ): Promise<boolean> => {
    if (!user || votingLock.current.has(targetEvent.id)) return false;

    const targetId = targetEvent.id;
    const targetPubkey = targetEvent.pubkey;
    
    const lastReaction = reactionMap.current[targetId]?.[user.pubkey];
    const lastContent = lastReaction?.content;
    const lastId = lastReaction?.id;

    const isCurrentlyUp = lastContent === "UPVOTE" || lastContent === "+";
    const isCurrentlyDown = lastContent === "DOWNVOTE" || lastContent === "-";
    const isUndoing = (type === "UPVOTE" && isCurrentlyUp) || 
                     (type === "DOWNVOTE" && isCurrentlyDown);

    // Store original state for potential rollback
    const originalVote = userVotes[targetId];

    votingLock.current.add(targetId);
    setVotingIds(prev => new Set(prev).add(targetId));
    setError(null);

    // Apply optimistic update
    applyOptimisticUpdate(targetId, isUndoing ? "UNDO" : type);

    try {
      if (isUndoing) {
        // Delete existing reaction
        if (lastId) {
          const deletion = new NDKEvent(ndk);
          deletion.kind = 5;
          deletion.content = "Unvoting";
          deletion.tags = [["e", lastId]];
          await deletion.publish();
        }
        
        // Update reaction map
        if (reactionMap.current[targetId]) {
          delete reactionMap.current[targetId][user.pubkey];
        }
      } else {
        // Publish new reaction
        const reaction = new NDKEvent(ndk);
        reaction.kind = NDKKind.Reaction;
        reaction.content = type === "UPVOTE" ? "+" : "-";
        reaction.tags = [
          ["e", targetId],
          ["p", targetPubkey]
        ];

        await reaction.publish();
        
        // Update reaction map
        if (!reactionMap.current[targetId]) reactionMap.current[targetId] = {};
        reactionMap.current[targetId][user.pubkey] = {
          id: reaction.id,
          content: reaction.content,
          created_at: Math.floor(Date.now() / 1000)
        };
      }
      
      return true;
    } catch (err) {
      console.error("Reaction failed:", err);
      setError("Failed to vote. Please try again.");
      // Revert optimistic update
      revertOptimisticUpdate(targetId, originalVote);
      return false;
    } finally {
      votingLock.current.delete(targetId);
      setVotingIds(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  };

  const processIncomingReaction = useCallback((event: NDKEvent) => {
    const targetId = event.tags.find(t => t[0] === "e")?.[1];
    if (!targetId) return;

    if (!reactionMap.current[targetId]) reactionMap.current[targetId] = {};
    
    const existing = reactionMap.current[targetId][event.pubkey];
    if (!existing || event.created_at! > existing.created_at) {
      reactionMap.current[targetId][event.pubkey] = {
        id: event.id,
        content: event.content,
        created_at: event.created_at!
      };
      updateScores();
    }
  }, [updateScores]);

  const processIncomingDeletion = useCallback((event: NDKEvent) => {
    const targetIds = event.tags.filter(t => t[0] === "e").map(t => t[1]);
    let changed = false;

    for (const targetId of targetIds) {
      for (const [postId, users] of Object.entries(reactionMap.current)) {
        for (const [pubkey, reaction] of Object.entries(users)) {
          if (reaction.id === targetId) {
            delete reactionMap.current[postId][pubkey];
            changed = true;
          }
        }
      }
    }

    if (changed) updateScores();
  }, [updateScores]);

  return {
    reactions,
    userVotes,
    votingIds,
    error,
    handleReaction,
    processIncomingReaction,
    processIncomingDeletion
  };
}
