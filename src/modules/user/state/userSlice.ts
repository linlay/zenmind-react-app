import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { DomainMode, ThemeMode } from '../../../core/types/common';
import { buildDefaultSettings } from '../../../core/storage/settingsStorage';
import { normalizeEndpointInput, normalizePtyUrlInput } from '../../../core/network/endpoint';
import { UserState } from '../types/user';

const defaults = buildDefaultSettings();

const initialState: UserState = {
  ...defaults,
  endpointDraft: defaults.endpointInput,
  ptyUrlDraft: defaults.ptyUrlInput,
  booting: true
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    hydrateSettings(state, action: PayloadAction<Partial<UserState>>) {
      const nextTheme = action.payload.themeMode === 'dark' ? 'dark' : 'light';
      const endpointInput = normalizeEndpointInput(action.payload.endpointInput || defaults.endpointInput);
      const ptyUrlInput = normalizePtyUrlInput(action.payload.ptyUrlInput || '', endpointInput);

      state.themeMode = nextTheme;
      state.endpointInput = endpointInput;
      state.ptyUrlInput = ptyUrlInput;
      state.endpointDraft = endpointInput;
      state.ptyUrlDraft = ptyUrlInput;
      state.selectedAgentKey = String(action.payload.selectedAgentKey || '');
      state.activeDomain = (action.payload.activeDomain as DomainMode) || 'chat';
      state.booting = false;
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    setEndpointDraft(state, action: PayloadAction<string>) {
      state.endpointDraft = action.payload;
    },
    setPtyUrlDraft(state, action: PayloadAction<string>) {
      state.ptyUrlDraft = action.payload;
    },
    applyEndpointDraft(state) {
      const normalizedEndpoint = normalizeEndpointInput(state.endpointDraft);
      const normalizedPty = normalizePtyUrlInput(state.ptyUrlDraft, normalizedEndpoint);
      state.endpointInput = normalizedEndpoint;
      state.ptyUrlInput = normalizedPty;
      state.endpointDraft = normalizedEndpoint;
      state.ptyUrlDraft = normalizedPty;
    },
    setSelectedAgentKey(state, action: PayloadAction<string>) {
      state.selectedAgentKey = action.payload;
    },
    setActiveDomain(state, action: PayloadAction<DomainMode>) {
      state.activeDomain = action.payload;
    },
    toggleTheme(state) {
      state.themeMode = state.themeMode === 'light' ? 'dark' : 'light';
    }
  }
});

export const {
  hydrateSettings,
  setThemeMode,
  setEndpointDraft,
  setPtyUrlDraft,
  applyEndpointDraft,
  setSelectedAgentKey,
  setActiveDomain,
  toggleTheme
} = userSlice.actions;

export default userSlice.reducer;
