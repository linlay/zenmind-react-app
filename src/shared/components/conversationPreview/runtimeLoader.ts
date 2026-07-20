import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import echartsRuntimeAsset from '../../../../.generated/conversation-preview/echarts.runtime.html';
import htmlRuntimeAsset from '../../../../.generated/conversation-preview/html.runtime.html';
import mermaidRuntimeAsset from '../../../../.generated/conversation-preview/mermaid.runtime.html';
import type { ConversationPreviewKind } from './types';

const RUNTIME_ASSET_BY_KIND: Record<ConversationPreviewKind, number> = {
  mermaid: mermaidRuntimeAsset,
  echarts: echartsRuntimeAsset,
  html: htmlRuntimeAsset
};

const runtimePromises = new Map<ConversationPreviewKind, Promise<string>>();

async function readRuntimeAsset(kind: ConversationPreviewKind): Promise<string> {
  const asset = Asset.fromModule(RUNTIME_ASSET_BY_KIND[kind]);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) {
    throw new Error(`Missing ${kind} preview runtime asset URI.`);
  }
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Unable to load ${kind} preview runtime (${response.status}).`);
    }
    return response.text();
  }
  return new File(uri).text();
}

export function loadConversationPreviewRuntime(kind: ConversationPreviewKind): Promise<string> {
  let promise = runtimePromises.get(kind);
  if (!promise) {
    promise = readRuntimeAsset(kind).catch((error) => {
      runtimePromises.delete(kind);
      throw error;
    });
    runtimePromises.set(kind, promise);
  }
  return promise;
}

export const conversationPreviewRuntimeLoaderInternals = {
  clear: () => runtimePromises.clear()
};
