import fs from 'node:fs';
import path from 'node:path';

export type RelayModelTier = 'inherit' | 'pro' | 'flash' | 'flash_lite';
export type GeminiApiModel =
  | 'gemini-3.8-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.5-flash-lite';

export interface ModelSelectionState {
  relayTier: RelayModelTier;
  geminiModel: GeminiApiModel;
}

const STATE_FILE = path.resolve(
  '/home/antigravity/shc08032545/antigravity-telegram-bridge/.relay-model.json',
);

export const DEFAULT_MODEL_STATE: ModelSelectionState = {
  relayTier: 'inherit',
  geminiModel: 'gemini-3.5-flash',
};

export function loadModelState(): ModelSelectionState {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { ...DEFAULT_MODEL_STATE };
    }
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as Partial<ModelSelectionState>;
    const relayTier: RelayModelTier =
      raw.relayTier && ['inherit', 'pro', 'flash', 'flash_lite'].includes(raw.relayTier)
        ? raw.relayTier
        : DEFAULT_MODEL_STATE.relayTier;
    const geminiModel: GeminiApiModel =
      raw.geminiModel &&
      ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'].includes(raw.geminiModel)
        ? raw.geminiModel
        : DEFAULT_MODEL_STATE.geminiModel;
    return { relayTier, geminiModel };
  } catch {
    return { ...DEFAULT_MODEL_STATE };
  }
}

export function saveModelState(patch: Partial<ModelSelectionState>): ModelSelectionState {
  const next: ModelSelectionState = {
    ...loadModelState(),
    ...patch,
  };
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return next;
}
