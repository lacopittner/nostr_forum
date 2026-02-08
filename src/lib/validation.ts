import { z } from 'zod';

// Community schema
export const communitySchema = z.object({
  name: z
    .string()
    .min(1, 'Community name is required')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9_\s]+$/, 'Only letters, numbers, spaces and underscores allowed'),
  description: z
    .string()
    .max(2000, 'Description must be less than 2000 characters')
    .optional(),
  image: z
    .string()
    .url('Please enter a valid URL')
    .optional()
    .or(z.literal('')),
  rules: z
    .string()
    .max(2000, 'Rules must be less than 2000 characters')
    .optional(),
  moderators: z
    .array(z.string().regex(/^(npub1|nsec1|[a-f0-9]{64})$/, 'Invalid pubkey format'))
    .optional(),
  flairs: z
    .array(z.string().min(1).max(30))
    .max(10, 'Maximum 10 flairs allowed')
    .optional(),
});

export type CommunityFormData = z.infer<typeof communitySchema>;

// Post schema
export const postSchema = z.object({
  content: z
    .string()
    .min(1, 'Content is required')
    .max(10000, 'Post is too long (max 10000 characters)'),
});

export type PostFormData = z.infer<typeof postSchema>;

// Comment schema
export const commentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment is required')
    .max(2000, 'Comment is too long (max 2000 characters)'),
});

export type CommentFormData = z.infer<typeof commentSchema>;

// Relay URL schema
export const relaySchema = z.object({
  url: z
    .string()
    .min(1, 'Relay URL is required')
    .transform((val) => {
      // Auto-add protocol if missing
      if (!val.startsWith('ws://') && !val.startsWith('wss://')) {
        return `wss://${val}`;
      }
      return val;
    })
    .refine(
      (val) => val.match(/^wss?:\/\/.+/),
      'Must be a valid WebSocket URL (ws:// or wss://)'
    ),
});

export type RelayFormData = z.infer<typeof relaySchema>;

// Private key schema
export const nsecSchema = z.object({
  nsec: z
    .string()
    .min(1, 'Private key is required')
    .regex(/^nsec1[a-z0-9]+$/, 'Invalid format. Must start with nsec1'),
});

export type NsecFormData = z.infer<typeof nsecSchema>;
