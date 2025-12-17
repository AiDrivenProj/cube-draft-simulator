import { Card } from "../types";

// AI Logic removed per user request for simplicity.
// File kept to avoid import errors if any, but exports do nothing relevant.

export const getDraftAdvice = async (
  currentPack: Card[], 
  currentPool: Card[], 
  archetype?: string
): Promise<string> => {
    return "AI Coach is disabled.";
};

export const suggestDeckBuild = async (pool: Card[]): Promise<string> => {
    return "Auto-build disabled.";
};