import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ApiError } from '../../core/api/apiError.ts';
import { startAccountLoginChallenge } from '../../core/api/services/deviceLinkApi.ts';
import { claimAccountLoginChallenge } from '../../core/auth/accountAuth.ts';
import { useT } from '../../shared/i18n';

type ActiveChallenge = {
  challengeId: string;
  claimToken: string;
  expiresAtMs: number;
  qrValue: string;
};

const POLL_INTERVAL_MS = 1_500;

export function AccountChallengeLogin({ deviceName, onSuccess }: { deviceName: string; onSuccess: () => void }) {
  const t = useT();
  const [challenge, setChallenge] = useState<ActiveChallenge | null>(null);
  const [error, setError] = useState('');
  const generationRef = useRef(0);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const createChallenge = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setChallenge(null);
    setError('');
    try {
      const created = await startAccountLoginChallenge({
        deviceName: deviceName.trim() || 'Mobile Device',
        deviceKind: 'mobile'
      });
      if (generationRef.current !== generation) return;
      const expiresAtMs = Date.parse(created.expiresAt);
      if (!created.challengeId || !created.claimToken || !Number.isFinite(expiresAtMs)) {
        throw new Error('Invalid login challenge');
      }
      // The QR carries only the public challenge identifier. claimToken stays in this component's memory.
      setChallenge({
        challengeId: created.challengeId,
        claimToken: created.claimToken,
        expiresAtMs,
        qrValue: JSON.stringify({ challengeId: created.challengeId })
      });
    } catch (requestError) {
      if (generationRef.current === generation) {
        setError(String((requestError as Error)?.message || t('auth.challenge.failed')));
      }
    }
  }, [deviceName, t]);

  useEffect(() => {
    createChallenge().catch(() => {});
    return () => {
      generationRef.current += 1;
    };
  }, [createChallenge]);

  useEffect(() => {
    if (!challenge) return;
    const generation = generationRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (generationRef.current !== generation) return;
      if (Date.now() >= challenge.expiresAtMs) {
        createChallenge().catch(() => {});
        return;
      }
      try {
        await claimAccountLoginChallenge(challenge.challengeId, challenge.claimToken);
        if (generationRef.current === generation) onSuccessRef.current();
      } catch (requestError) {
        if (generationRef.current !== generation) return;
        if (requestError instanceof ApiError && requestError.status === 409) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        if (requestError instanceof ApiError && requestError.status === 410) {
          createChallenge().catch(() => {});
          return;
        }
        setError(String((requestError as Error)?.message || t('auth.challenge.failed')));
      }
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [challenge, createChallenge, t]);

  if (error) {
    return (
      <Pressable onPress={() => createChallenge().catch(() => {})} className="items-center py-app-md">
        <Text className="text-app-body-sm text-app-danger">
          {error} · {t('common.retry')}
        </Text>
      </Pressable>
    );
  }
  if (!challenge) {
    return (
      <View className="items-center py-app-lg">
        <ActivityIndicator size="small" />
      </View>
    );
  }
  return (
    <View className="items-center gap-app-md rounded-app-md bg-white p-app-lg">
      <QRCode value={challenge.qrValue} size={196} ecl="M" />
      <Text className="text-center text-app-body-sm text-black">{t('auth.challenge.scanHint')}</Text>
    </View>
  );
}
