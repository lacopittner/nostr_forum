// Encryption utilities for secure nsec storage

const ENCRYPTION_KEY = "nostr_reddit_encrypted_key";

/**
 * Derive encryption key from PIN using PBKDF2
 */
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);

  // Import PIN as base key
  const baseKey = await crypto.subtle.importKey(
    "raw",
    pinData,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt nsec with PIN
 */
export async function encryptNsec(nsec: string, pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nsec);
  
  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive key from PIN
  const key = await deriveKey(pin, salt);
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  
  // Combine salt + iv + ciphertext
  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  // Convert to base64 for storage
  return btoa(String.fromCharCode(...result));
}

/**
 * Decrypt nsec with PIN
 */
export async function decryptNsec(encryptedData: string, pin: string): Promise<string | null> {
  try {
    // Decode from base64
    const binary = atob(encryptedData);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      data[i] = binary.charCodeAt(i);
    }
    
    // Extract salt, iv, and ciphertext
    const salt = data.slice(0, 16);
    const iv = data.slice(16, 28);
    const ciphertext = data.slice(28);
    
    // Derive key from PIN
    const key = await deriveKey(pin, salt);
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    return null; // Decryption failed (wrong PIN)
  }
}

/**
 * Check if encrypted nsec exists
 */
export function hasEncryptedNsec(): boolean {
  return localStorage.getItem(ENCRYPTION_KEY) !== null;
}

/**
 * Get encrypted nsec from storage
 */
export function getEncryptedNsec(): string | null {
  return localStorage.getItem(ENCRYPTION_KEY);
}

/**
 * Save encrypted nsec to storage
 */
export function saveEncryptedNsec(encrypted: string): void {
  localStorage.setItem(ENCRYPTION_KEY, encrypted);
}

/**
 * Clear encrypted nsec from storage
 */
export function clearEncryptedNsec(): void {
  localStorage.removeItem(ENCRYPTION_KEY);
}
